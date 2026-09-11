/* =============================================================================
   شحنلي | Shahnly — Auto Top-Up Service (C++17, Standard Library Only)
   -----------------------------------------------------------------------------
   Implements the unified contract in ARCHITECTURE.md:
     GET  /api/v1/health
     GET  /api/v1/countries
     POST /api/v1/validate
     POST /api/v1/topup
     GET  /api/v1/topup/{jobId}

   - Sockets: WinSock2 (Windows) + POSIX sockets (Linux/macOS) in one file.
   - Hand written JSON parser (extracts only what is needed) + JSON generator.
   - Top-up engine running in std::thread with std::mutex + queue.
   - 3 attempts with escalating backoff (2s -> 4s -> 8s; demo: 1s -> 2s -> 3s).
   - Country table with 58 countries mirroring assets/js/countries.js.
   - Storage: orders.jsonl (append-only JSON Lines).
   - --selftest runs offline and prints PASS/FAIL.

   Build (Windows / MinGW-w64 or MSVC):
     g++ -std=c++17 -O2 -pthread -o topup_server.exe topup_server.cpp -lws2_32
   Build (Linux/macOS):
     g++ -std=c++17 -O2 -pthread -o topup_server topup_server.cpp
   ============================================================================= */

#include <algorithm>
#include <array>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <deque>
#include <fstream>
#include <iostream>
#include <map>
#include <mutex>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

/* ---------------------------------------------------------------------------
   Platform socket layer
   ------------------------------------------------------------------------- */
#ifdef _WIN32
  #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
  #endif
  #include <winsock2.h>
  #include <ws2tcpip.h>
  using sock_t = SOCKET;
  #define SHN_INVALID_SOCK INVALID_SOCKET
  #define shn_close_sock   closesocket
  #define shn_last_error   WSAGetLastError()
#else
  #include <arpa/inet.h>
  #include <netinet/in.h>
  #include <netinet/tcp.h>
  #include <sys/socket.h>
  #include <sys/types.h>
  #include <unistd.h>
  using sock_t = int;
  #define SHN_INVALID_SOCK (-1)
  #define shn_close_sock   ::close
  #define shn_last_error   errno
#endif

namespace shn {

static const char* kServiceName = "shahnly-topup-cpp";
static const char* kVersion     = "1.0.0";

/* ===========================================================================
   1) Small utilities
   ========================================================================= */

static std::string isoNow() {
    std::time_t t = std::time(nullptr);
    std::tm tmv;
    std::memset(&tmv, 0, sizeof(tmv));
#ifdef _WIN32
    gmtime_s(&tmv, &t);
#else
    gmtime_r(&t, &tmv);
#endif
    char buf[40];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmv);
    return std::string(buf);
}

static std::string dayStamp() {
    std::time_t t = std::time(nullptr);
    std::tm tmv;
    std::memset(&tmv, 0, sizeof(tmv));
#ifdef _WIN32
    localtime_s(&tmv, &t);
#else
    localtime_r(&t, &tmv);
#endif
    char buf[16];
    std::strftime(buf, sizeof(buf), "%y%m%d", &tmv);
    return std::string(buf);
}

static std::string nowIsoMs() {
    using namespace std::chrono;
    auto tp = system_clock::now();
    auto ms = duration_cast<milliseconds>(tp.time_since_epoch()).count();
    std::ostringstream o;
    o << ms;
    return o.str();
}

static std::string onlyDigits(const std::string& v) {
    std::string o;
    o.reserve(v.size());
    for (char ch : v) {
        if (ch >= '0' && ch <= '9') o += ch;
    }
    return o;
}

static bool startsWith(const std::string& s, const std::string& p) {
    return s.size() >= p.size() && s.compare(0, p.size(), p) == 0;
}

static std::string stripLeadingZeros(const std::string& s) {
    size_t i = 0;
    while (i < s.size() && s[i] == '0') ++i;
    return s.substr(i);
}

static std::string trim(const std::string& s) {
    size_t a = 0, b = s.size();
    while (a < b && (unsigned char)s[a] <= ' ') ++a;
    while (b > a && (unsigned char)s[b - 1] <= ' ') --b;
    return s.substr(a, b - a);
}

static std::string toLower(const std::string& s) {
    std::string o = s;
    for (char& c : o) {
        if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    }
    return o;
}

static std::string toUpper(const std::string& s) {
    std::string o = s;
    for (char& c : o) {
        if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
    }
    return o;
}

static std::string pad4(int n) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%04d", n);
    return std::string(buf);
}

static void sleepMs(long long ms) {
    if (ms <= 0) return;
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
}

/* ===========================================================================
   2) JSON parser (hand written, extracts only what is needed)
   ========================================================================= */

struct Json {
    enum Type { NUL, BOOL, NUM, STR, ARR, OBJ };

    Type type = NUL;
    bool b = false;
    double num = 0.0;
    std::string str;
    std::vector<Json> arr;
    std::vector<std::pair<std::string, Json> > obj;

    bool isObj() const { return type == OBJ; }
    bool isStr() const { return type == STR; }
    bool isNum() const { return type == NUM; }
    bool isArr() const { return type == ARR; }
    bool isNull() const { return type == NUL; }

    const Json* find(const std::string& key) const {
        if (type != OBJ) return nullptr;
        for (size_t i = 0; i < obj.size(); ++i) {
            if (obj[i].first == key) return &obj[i].second;
        }
        return nullptr;
    }

    bool has(const std::string& key) const { return find(key) != nullptr; }

    bool hasText(const std::string& key) const {
        const Json* v = find(key);
        if (!v) return false;
        if (v->type == STR) return !v->str.empty();
        if (v->type == NUM) return true;
        return false;
    }

    std::string getStr(const std::string& key, const std::string& def = std::string()) const {
        const Json* v = find(key);
        if (!v) return def;
        if (v->type == STR) return v->str;
        if (v->type == NUM) {
            std::ostringstream o;
            o << v->num;
            return o.str();
        }
        if (v->type == BOOL) return v->b ? "true" : "false";
        return def;
    }

    double getNum(const std::string& key, double def = 0.0) const {
        const Json* v = find(key);
        if (!v) return def;
        if (v->type == NUM) return v->num;
        if (v->type == STR) {
            try {
                return std::stod(v->str);
            } catch (...) {
                return def;
            }
        }
        return def;
    }
};

class JsonParser {
public:
    explicit JsonParser(const std::string& src) : src_(src), pos_(0) {}

    bool parse(Json& out, std::string& err) {
        pos_ = 0;
        err_.clear();
        skipWs();
        if (!parseValue(out)) {
            err = err_.empty() ? std::string("invalid json") : err_;
            return false;
        }
        skipWs();
        if (pos_ != src_.size()) {
            err = "trailing data after json value";
            return false;
        }
        return true;
    }

private:
    const std::string& src_;
    size_t pos_;
    std::string err_;

    bool fail(const std::string& m) {
        if (err_.empty()) err_ = m;
        return false;
    }

    bool lit(const char* s, size_t n) const {
        return pos_ + n <= src_.size() && src_.compare(pos_, n, s) == 0;
    }

    void skipWs() {
        while (pos_ < src_.size()) {
            char c = src_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                ++pos_;
            } else {
                break;
            }
        }
    }

    static void appendUtf8(std::string& out, unsigned cp) {
        if (cp <= 0x7Fu) {
            out += (char)cp;
        } else if (cp <= 0x7FFu) {
            out += (char)(0xC0u | (cp >> 6));
            out += (char)(0x80u | (cp & 0x3Fu));
        } else if (cp <= 0xFFFFu) {
            out += (char)(0xE0u | (cp >> 12));
            out += (char)(0x80u | ((cp >> 6) & 0x3Fu));
            out += (char)(0x80u | (cp & 0x3Fu));
        } else {
            out += (char)(0xF0u | (cp >> 18));
            out += (char)(0x80u | ((cp >> 12) & 0x3Fu));
            out += (char)(0x80u | ((cp >> 6) & 0x3Fu));
            out += (char)(0x80u | (cp & 0x3Fu));
        }
    }

    bool parseHex4(unsigned& out) {
        if (pos_ + 4 > src_.size()) return fail("bad \\u escape");
        unsigned cp = 0;
        for (int i = 0; i < 4; ++i) {
            char h = src_[pos_++];
            cp <<= 4;
            if (h >= '0' && h <= '9')      cp |= (unsigned)(h - '0');
            else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
            else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
            else return fail("bad hex digit in \\u escape");
        }
        out = cp;
        return true;
    }

    bool parseString(std::string& out) {
        out.clear();
        if (pos_ >= src_.size() || src_[pos_] != '"') return fail("expected string");
        ++pos_;
        while (pos_ < src_.size()) {
            unsigned char c = (unsigned char)src_[pos_];
            if (c == '"') {
                ++pos_;
                return true;
            }
            if (c == '\\') {
                ++pos_;
                if (pos_ >= src_.size()) return fail("bad escape");
                char e = src_[pos_++];
                switch (e) {
                    case '"':  out += '"';  break;
                    case '\\': out += '\\'; break;
                    case '/':  out += '/';  break;
                    case 'b':  out += '\b'; break;
                    case 'f':  out += '\f'; break;
                    case 'n':  out += '\n'; break;
                    case 'r':  out += '\r'; break;
                    case 't':  out += '\t'; break;
                    case 'u': {
                        unsigned cp = 0;
                        if (!parseHex4(cp)) return false;
                        if (cp >= 0xD800u && cp <= 0xDBFFu) {
                            // try to combine with a following low surrogate
                            if (pos_ + 1 < src_.size() && src_[pos_] == '\\' && src_[pos_ + 1] == 'u') {
                                size_t save = pos_;
                                pos_ += 2;
                                unsigned lo = 0;
                                if (parseHex4(lo) && lo >= 0xDC00u && lo <= 0xDFFFu) {
                                    cp = 0x10000u + ((cp - 0xD800u) << 10) + (lo - 0xDC00u);
                                } else {
                                    pos_ = save;
                                }
                            }
                        }
                        appendUtf8(out, cp);
                        break;
                    }
                    default:
                        return fail("bad escape character");
                }
            } else {
                out += (char)c;
                ++pos_;
            }
        }
        return fail("unterminated string");
    }

    bool parseNumber(Json& v) {
        const char* start = src_.c_str() + pos_;
        char* endp = nullptr;
        errno = 0;
        double d = std::strtod(start, &endp);
        if (endp == start) return fail("bad number");
        pos_ += (size_t)(endp - start);
        v.type = Json::NUM;
        v.num = d;
        return true;
    }

    bool parseArray(Json& v) {
        v.type = Json::ARR;
        ++pos_;  // '['
        skipWs();
        if (pos_ < src_.size() && src_[pos_] == ']') {
            ++pos_;
            return true;
        }
        for (;;) {
            Json item;
            if (!parseValue(item)) return false;
            v.arr.push_back(item);
            skipWs();
            if (pos_ >= src_.size()) return fail("unterminated array");
            if (src_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (src_[pos_] == ']') {
                ++pos_;
                return true;
            }
            return fail("expected ',' or ']'");
        }
    }

    bool parseObject(Json& v) {
        v.type = Json::OBJ;
        ++pos_;  // '{'
        skipWs();
        if (pos_ < src_.size() && src_[pos_] == '}') {
            ++pos_;
            return true;
        }
        for (;;) {
            skipWs();
            if (pos_ >= src_.size() || src_[pos_] != '"') return fail("expected object key");
            std::string key;
            if (!parseString(key)) return false;
            skipWs();
            if (pos_ >= src_.size() || src_[pos_] != ':') return fail("expected ':'");
            ++pos_;
            Json val;
            if (!parseValue(val)) return false;
            v.obj.push_back(std::make_pair(key, val));
            skipWs();
            if (pos_ >= src_.size()) return fail("unterminated object");
            if (src_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (src_[pos_] == '}') {
                ++pos_;
                return true;
            }
            return fail("expected ',' or '}'");
        }
    }

    bool parseValue(Json& v) {
        skipWs();
        if (pos_ >= src_.size()) return fail("unexpected end of input");
        char c = src_[pos_];
        switch (c) {
            case '{': return parseObject(v);
            case '[': return parseArray(v);
            case '"': {
                v.type = Json::STR;
                return parseString(v.str);
            }
            case 't': {
                if (!lit("true", 4)) return fail("bad literal");
                pos_ += 4;
                v.type = Json::BOOL;
                v.b = true;
                return true;
            }
            case 'f': {
                if (!lit("false", 5)) return fail("bad literal");
                pos_ += 5;
                v.type = Json::BOOL;
                v.b = false;
                return true;
            }
            case 'n': {
                if (!lit("null", 4)) return fail("bad literal");
                pos_ += 4;
                v.type = Json::NUL;
                return true;
            }
            default:
                return parseNumber(v);
        }
    }
};

/* ===========================================================================
   3) JSON generator helpers
   ========================================================================= */

static std::string jEsc(const std::string& in) {
    std::string o;
    o.reserve(in.size() + 2);
    o += '"';
    for (size_t i = 0; i < in.size(); ++i) {
        unsigned char c = (unsigned char)in[i];
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\b': o += "\\b";  break;
            case '\f': o += "\\f";  break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;
            default:
                if (c < 0x20u) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", (unsigned)c);
                    o += buf;
                } else {
                    o += (char)c;  // UTF-8 bytes pass through untouched
                }
        }
    }
    o += '"';
    return o;
}

static std::string jStr(const std::string& v) { return jEsc(v); }

static std::string jNull() { return "null"; }

/* JSON string or null when the value is empty */
static std::string jStrOrNull(const std::string& v) {
    return v.empty() ? std::string("null") : jEsc(v);
}

static std::string jInt(long long v) {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%lld", v);
    return std::string(buf);
}

static std::string jNum(double v) {
    if (std::fabs(v) < 1e15 && std::fabs(v - (double)(long long)v) < 1e-9) {
        return jInt((long long)v);
    }
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.10g", v);
    return std::string(buf);
}

static std::string jBool(bool b) { return b ? "true" : "false"; }

}  // namespace shn

namespace shn {

/* ===========================================================================
   4) Country table — mirrors assets/js/countries.js
      18 arab + 23 europe + 17 other = 58 countries
      pat : local number pattern, applied AFTER stripping leading zeros
            (same semantics as COUNTRIES.validate() in countries.js)
      ex  : example number (usually written in local form, with leading zero)
   ========================================================================= */

struct Currency {
    std::string code;   // EGP
    std::string sym;    // ج.م
    int dec;            // decimals
    double rate;        // how many units of this currency == 1 EGP (demo)
    std::string pos;    // "before" | "after"
};

struct Country {
    std::string c;      // ISO code
    std::string ar;     // Arabic name
    std::string en;     // English name
    std::string f;      // flag emoji
    std::string dial;   // international dial code
    int mn;             // min national digits
    int mx;             // max national digits
    std::string pat;    // local pattern
    std::string ex;     // example
    std::string zone;   // arab | europe | other
    std::string lang;
    Currency cur;
};

static const std::vector<Country>& countryTable() {
    static const std::vector<Country> LIST = {
        /* ---------------- الدول العربية (18) ---------------- */
        { "EG", "مصر", "Egypt", "🇪🇬", "20", 10, 10, "^1[0125]\\d{8}$", "01012345678", "arab", "ar",
          { "EGP", "ج.م", 0, 1.0, "after" } },
        { "SA", "السعودية", "Saudi Arabia", "🇸🇦", "966", 9, 9, "^5\\d{8}$", "0512345678", "arab", "ar",
          { "SAR", "ر.س", 2, 0.0763, "after" } },
        { "AE", "الإمارات", "United Arab Emirates", "🇦🇪", "971", 9, 9, "^5[024568]\\d{7}$", "0501234567", "arab", "ar",
          { "AED", "د.إ", 2, 0.0746, "after" } },
        { "KW", "الكويت", "Kuwait", "🇰🇼", "965", 8, 8, "^[569]\\d{7}$", "51234567", "arab", "ar",
          { "KWD", "د.ك", 3, 0.0062, "after" } },
        { "QA", "قطر", "Qatar", "🇶🇦", "974", 8, 8, "^[3567]\\d{7}$", "33123456", "arab", "ar",
          { "QAR", "ر.ق", 2, 0.0742, "after" } },
        { "BH", "البحرين", "Bahrain", "🇧🇭", "973", 8, 8, "^[1367]\\d{7}$", "36123456", "arab", "ar",
          { "BHD", "د.ب", 3, 0.0077, "after" } },
        { "OM", "عُمان", "Oman", "🇴🇲", "968", 8, 8, "^[279]\\d{7}$", "91234567", "arab", "ar",
          { "OMR", "ر.ع", 3, 0.0078, "after" } },
        { "JO", "الأردن", "Jordan", "🇯🇴", "962", 9, 9, "^7[789]\\d{7}$", "0791234567", "arab", "ar",
          { "JOD", "د.أ", 2, 0.0145, "after" } },
        { "LB", "لبنان", "Lebanon", "🇱🇧", "961", 7, 8, "^[37]\\d{6,7}$", "03123456", "arab", "ar",
          { "LBP", "ل.ل", 0, 1815.0, "after" } },
        { "IQ", "العراق", "Iraq", "🇮🇶", "964", 10, 10, "^7[0-9]\\d{8}$", "07701234567", "arab", "ar",
          { "IQD", "د.ع", 0, 26.8, "after" } },
        { "MA", "المغرب", "Morocco", "🇲🇦", "212", 9, 9, "^[67]\\d{8}$", "0612345678", "arab", "ar",
          { "MAD", "د.م", 2, 0.199, "after" } },
        { "DZ", "الجزائر", "Algeria", "🇩🇿", "213", 9, 9, "^[567]\\d{8}$", "0551234567", "arab", "ar",
          { "DZD", "د.ج", 0, 2.72, "after" } },
        { "TN", "تونس", "Tunisia", "🇹🇳", "216", 8, 8, "^[2459]\\d{7}$", "20123456", "arab", "ar",
          { "TND", "د.ت", 3, 0.0605, "after" } },
        { "LY", "ليبيا", "Libya", "🇱🇾", "218", 9, 9, "^9[1-6]\\d{7}$", "0912345678", "arab", "ar",
          { "LYD", "د.ل", 2, 0.098, "after" } },
        { "SD", "السودان", "Sudan", "🇸🇩", "249", 9, 9, "^9\\d{8}$", "0912345678", "arab", "ar",
          { "SDG", "ج.س", 0, 12.3, "after" } },
        { "YE", "اليمن", "Yemen", "🇾🇪", "967", 9, 9, "^7[0-8]\\d{7}$", "0712345678", "arab", "ar",
          { "YER", "ر.ي", 0, 5.05, "after" } },
        { "SY", "سوريا", "Syria", "🇸🇾", "963", 9, 9, "^9\\d{8}$", "0912345678", "arab", "ar",
          { "SYP", "ل.س", 0, 265.0, "after" } },
        { "PS", "فلسطين", "Palestine", "🇵🇸", "970", 9, 9, "^5[69]\\d{7}$", "0591234567", "arab", "ar",
          { "ILS", "₪", 2, 0.0748, "before" } },

        /* ---------------- أشهر الدول الأوروبية (23) ---------------- */
        { "GB", "بريطانيا", "United Kingdom", "🇬🇧", "44", 10, 10, "^7\\d{9}$", "07123456789", "europe", "en",
          { "GBP", "£", 2, 0.0161, "before" } },
        { "IE", "أيرلندا", "Ireland", "🇮🇪", "353", 9, 9, "^8[356789]\\d{7}$", "0851234567", "europe", "en",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "FR", "فرنسا", "France", "🇫🇷", "33", 9, 9, "^[67]\\d{8}$", "0612345678", "europe", "fr",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "DE", "ألمانيا", "Germany", "🇩🇪", "49", 10, 11, "^1[5-7]\\d{8,9}$", "015112345678", "europe", "de",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "ES", "إسبانيا", "Spain", "🇪🇸", "34", 9, 9, "^[67]\\d{8}$", "0612345678", "europe", "es",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "IT", "إيطاليا", "Italy", "🇮🇹", "39", 9, 10, "^3\\d{8,9}$", "0312345678", "europe", "it",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "PT", "البرتغال", "Portugal", "🇵🇹", "351", 9, 9, "^9[1236]\\d{7}$", "0912345678", "europe", "pt",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "NL", "هولندا", "Netherlands", "🇳🇱", "31", 9, 9, "^6\\d{8}$", "0612345678", "europe", "en",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "BE", "بلجيكا", "Belgium", "🇧🇪", "32", 9, 9, "^4\\d{8}$", "0470123456", "europe", "fr",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "CH", "سويسرا", "Switzerland", "🇨🇭", "41", 9, 9, "^7[5-9]\\d{7}$", "0751234567", "europe", "de",
          { "CHF", "CHF", 2, 0.0165, "before" } },
        { "AT", "النمسا", "Austria", "🇦🇹", "43", 10, 11, "^6\\d{8,9}$", "06641234567", "europe", "de",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "SE", "السويد", "Sweden", "🇸🇪", "46", 9, 9, "^7\\d{8}$", "0701234567", "europe", "en",
          { "SEK", "kr", 2, 0.195, "after" } },
        { "NO", "النرويج", "Norway", "🇳🇴", "47", 8, 8, "^[49]\\d{7}$", "41234567", "europe", "en",
          { "NOK", "kr", 2, 0.216, "after" } },
        { "DK", "الدنمارك", "Denmark", "🇩🇰", "45", 8, 8, "^[2-9]\\d{7}$", "20123456", "europe", "en",
          { "DKK", "kr", 2, 0.139, "after" } },
        { "FI", "فنلندا", "Finland", "🇫🇮", "358", 9, 10, "^4\\d{8,9}$", "0412345678", "europe", "en",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "PL", "بولندا", "Poland", "🇵🇱", "48", 9, 9, "^[5-8]\\d{8}$", "512345678", "europe", "en",
          { "PLN", "zł", 2, 0.0735, "after" } },
        { "RO", "رومانيا", "Romania", "🇷🇴", "40", 9, 9, "^7\\d{8}$", "0712345678", "europe", "en",
          { "RON", "lei", 2, 0.0935, "after" } },
        { "GR", "اليونان", "Greece", "🇬🇷", "30", 10, 10, "^69\\d{8}$", "6912345678", "europe", "en",
          { "EUR", "€", 2, 0.0187, "before" } },
        { "CZ", "التشيك", "Czechia", "🇨🇿", "420", 9, 9, "^[67]\\d{8}$", "601123456", "europe", "en",
          { "CZK", "Kč", 2, 0.445, "after" } },
        { "HU", "المجر", "Hungary", "🇭🇺", "36", 9, 9, "^[2367]\\d{8}$", "0612345678", "europe", "en",
          { "HUF", "Ft", 0, 7.45, "after" } },
        { "UA", "أوكرانيا", "Ukraine", "🇺🇦", "380", 9, 9, "^[3-9]\\d{8}$", "0501234567", "europe", "ru",
          { "UAH", "₴", 2, 0.85, "after" } },
        { "RU", "روسيا", "Russia", "🇷🇺", "7", 10, 10, "^9\\d{9}$", "09123456789", "europe", "ru",
          { "RUB", "₽", 2, 1.62, "after" } },
        { "TR", "تركيا", "Türkiye", "🇹🇷", "90", 10, 10, "^5\\d{9}$", "05123456789", "europe", "tr",
          { "TRY", "₺", 2, 0.79, "after" } },

        /* ---------------- دول أخرى (17) ---------------- */
        { "US", "أمريكا", "United States", "🇺🇸", "1", 10, 10, "^[2-9]\\d{9}$", "2025550123", "other", "en",
          { "USD", "$", 2, 0.0203, "before" } },
        { "CA", "كندا", "Canada", "🇨🇦", "1", 10, 10, "^[2-9]\\d{9}$", "4165550123", "other", "en",
          { "CAD", "C$", 2, 0.0282, "before" } },
        { "AU", "أستراليا", "Australia", "🇦🇺", "61", 9, 9, "^4\\d{8}$", "0412345678", "other", "en",
          { "AUD", "A$", 2, 0.0312, "before" } },
        { "IN", "الهند", "India", "🇮🇳", "91", 10, 10, "^[6-9]\\d{9}$", "9876543210", "other", "en",
          { "INR", "₹", 2, 1.78, "before" } },
        { "PK", "باكستان", "Pakistan", "🇵🇰", "92", 10, 10, "^3\\d{9}$", "03001234567", "other", "en",
          { "PKR", "₨", 0, 5.65, "after" } },
        { "NG", "نيجيريا", "Nigeria", "🇳🇬", "234", 10, 10, "^[789]\\d{9}$", "08031234567", "other", "en",
          { "NGN", "₦", 0, 30.5, "before" } },
        { "KE", "كينيا", "Kenya", "🇰🇪", "254", 9, 9, "^7\\d{8}$", "0712345678", "other", "en",
          { "KES", "KSh", 2, 2.62, "before" } },
        { "ZA", "جنوب أفريقيا", "South Africa", "🇿🇦", "27", 9, 9, "^[6-8]\\d{8}$", "0712345678", "other", "en",
          { "ZAR", "R", 2, 0.375, "before" } },
        { "BR", "البرازيل", "Brazil", "🇧🇷", "55", 10, 11, "^\\d{10,11}$", "11912345678", "other", "pt",
          { "BRL", "R$", 2, 0.113, "before" } },
        { "MX", "المكسيك", "Mexico", "🇲🇽", "52", 10, 10, "^\\d{10}$", "5512345678", "other", "es",
          { "MXN", "MX$", 2, 0.375, "before" } },
        { "ID", "إندونيسيا", "Indonesia", "🇮🇩", "62", 9, 11, "^8\\d{8,10}$", "08123456789", "other", "en",
          { "IDR", "Rp", 0, 330.0, "before" } },
        { "PH", "الفلبين", "Philippines", "🇵🇭", "63", 10, 10, "^9\\d{9}$", "09171234567", "other", "en",
          { "PHP", "₱", 2, 1.16, "before" } },
        { "MY", "ماليزيا", "Malaysia", "🇲🇾", "60", 9, 10, "^1\\d{8,9}$", "0123456789", "other", "en",
          { "MYR", "RM", 2, 0.0925, "before" } },
        { "SG", "سنغافورة", "Singapore", "🇸🇬", "65", 8, 8, "^[89]\\d{7}$", "81234567", "other", "en",
          { "SGD", "S$", 2, 0.0272, "before" } },
        { "JP", "اليابان", "Japan", "🇯🇵", "81", 10, 10, "^[789]0\\d{8}$", "09012345678", "other", "en",
          { "JPY", "¥", 0, 3.05, "before" } },
        { "KR", "كوريا الجنوبية", "South Korea", "🇰🇷", "82", 9, 10, "^1\\d{8,9}$", "01012345678", "other", "en",
          { "KRW", "₩", 0, 27.6, "before" } },
        { "CN", "الصين", "China", "🇨🇳", "86", 11, 11, "^1[3-9]\\d{9}$", "013123456789", "other", "en",
          { "CNY", "¥", 2, 0.147, "before" } }
    };
    return LIST;
}

static const Country* byCode(const std::string& code) {
    std::string up = toUpper(trim(code));
    const std::vector<Country>& l = countryTable();
    for (size_t i = 0; i < l.size(); ++i) {
        if (l[i].c == up) return &l[i];
    }
    return nullptr;
}

static bool patMatch(const std::string& pat, const std::string& value) {
    static std::mutex m;
    static std::map<std::string, std::regex> cache;
    std::lock_guard<std::mutex> lk(m);
    std::map<std::string, std::regex>::iterator it = cache.find(pat);
    if (it == cache.end()) {
        try {
            std::regex re(pat, std::regex::ECMAScript);
            it = cache.insert(std::make_pair(pat, re)).first;
        } catch (...) {
            return false;
        }
    }
    try {
        return std::regex_search(value, it->second);
    } catch (...) {
        return false;
    }
}

/* ---------------- international phone helpers (mirror countries.js) ------- */

static std::string toE164(const std::string& value, const Country& c) {
    std::string d = onlyDigits(value);
    if (d.empty()) return std::string();
    if (d.size() >= 2 && d.compare(0, 2, "00") == 0) d = d.substr(2);
    if (startsWith(d, c.dial) && d.size() > c.dial.size() + 4) return "+" + d;
    if (!d.empty() && d[0] == '0') return "+" + c.dial + stripLeadingZeros(d);
    if (patMatch(c.pat, d)) return "+" + c.dial + d;
    return "+" + d;
}

struct ValResult {
    bool ok;
    std::string reason;   // ok | empty | short | long | pattern
    std::string e164;
    const Country* country;
    ValResult() : ok(false), reason("empty"), country(nullptr) {}
};

static ValResult validatePhone(const std::string& value, const Country& c) {
    ValResult r;
    r.country = &c;
    std::string d = onlyDigits(value);
    if (d.empty()) {
        r.reason = "empty";
        return r;
    }
    r.e164 = toE164(d, c);
    std::string nat = d;
    if (nat.size() >= 2 && nat.compare(0, 2, "00") == 0) nat = nat.substr(2);
    if (startsWith(nat, c.dial) && nat.size() > c.dial.size() + 4) nat = nat.substr(c.dial.size());
    nat = stripLeadingZeros(nat);
    if ((int)nat.size() < c.mn) {
        r.reason = "short";
        return r;
    }
    if ((int)nat.size() > c.mx) {
        r.reason = "long";
        return r;
    }
    if (!patMatch(c.pat, nat)) {
        r.reason = "pattern";
        return r;
    }
    r.ok = true;
    r.reason = "ok";
    return r;
}

static bool detectCountry(const std::string& value, const Country*& out, std::string& e164) {
    std::string d = onlyDigits(value);
    if (d.empty()) return false;
    std::vector<const Country*> sorted;
    const std::vector<Country>& l = countryTable();
    sorted.reserve(l.size());
    for (size_t i = 0; i < l.size(); ++i) sorted.push_back(&l[i]);
    // longest dial prefix first, exactly like COUNTRIES.detect()
    std::stable_sort(sorted.begin(), sorted.end(), [](const Country* a, const Country* b) {
        return a->dial.size() > b->dial.size();
    });
    for (size_t i = 0; i < sorted.size(); ++i) {
        const Country* c = sorted[i];
        if (!startsWith(d, c->dial)) continue;
        ValResult r = validatePhone(d, *c);
        if (r.ok) {
            out = c;
            e164 = r.e164;
            return true;
        }
    }
    return false;
}

struct GenericResult {
    bool ok;
    std::string reason;   // generic | short | long
    std::string e164;
};

/* Accept any country outside the table in E.164 form (6..15 digits) */
static GenericResult validateGeneric(const std::string& value) {
    GenericResult g;
    std::string d = onlyDigits(value);
    if (d.size() >= 2 && d.compare(0, 2, "00") == 0) d = d.substr(2);
    if (d.size() >= 6 && d.size() <= 15) {
        g.ok = true;
        g.reason = "generic";
        g.e164 = "+" + d;
    } else {
        g.ok = false;
        g.reason = (d.size() < 6) ? "short" : "long";
    }
    return g;
}

/* playerId: 8..12 digits (see ARCHITECTURE.md §3.3) */
static bool playerIdValid(const std::string& v) {
    std::string d = onlyDigits(v);
    if (d.empty()) return false;
    if (d.size() < 8 || d.size() > 12) return false;
    // reject strings that contain characters other than digits/spaces/dashes
    for (size_t i = 0; i < v.size(); ++i) {
        char ch = v[i];
        if (ch >= '0' && ch <= '9') continue;
        if (ch == ' ' || ch == '-' || ch == '_') continue;
        return false;
    }
    return true;
}

}  // namespace shn

namespace shn {

/* ===========================================================================
   5) Configuration (environment variables, see ARCHITECTURE.md §5)
   ========================================================================= */

struct Config {
    int         port            = 8788;   // PORT
    std::string providerMode    = "demo";  // PROVIDER_MODE
    std::string providerUrl;               // PROVIDER_URL
    std::string providerKey;               // PROVIDER_KEY
    double      demoFailureRate = 0.05;    // DEMO_FAILURE_RATE
    int         maxAttempts     = 3;       // MAX_ATTEMPTS
    std::string ordersFile      = "orders.jsonl";  // ORDERS_FILE
    std::string telegramToken;             // TELEGRAM_BOT_TOKEN
    std::string telegramChat;              // TELEGRAM_CHAT_ID

    /* runtime-only switches (selftest) */
    bool fastMode    = false;  // no real sleeps
    bool forceSuccess = false; // always deliver
    bool forceFail    = false; // always exhaust attempts
};

static std::string envStr(const char* key, const std::string& def) {
    const char* v = std::getenv(key);
    if (!v || !*v) return def;
    return std::string(v);
}

static int envInt(const char* key, int def) {
    const char* v = std::getenv(key);
    if (!v || !*v) return def;
    try {
        return std::stoi(std::string(v));
    } catch (...) {
        return def;
    }
}

static double envDouble(const char* key, double def) {
    const char* v = std::getenv(key);
    if (!v || !*v) return def;
    try {
        return std::stod(std::string(v));
    } catch (...) {
        return def;
    }
}

static Config configFromEnv() {
    Config c;
    c.port            = envInt("PORT", 8788);
    c.providerMode    = toLower(envStr("PROVIDER_MODE", "demo"));
    c.providerUrl     = envStr("PROVIDER_URL", "");
    c.providerKey     = envStr("PROVIDER_KEY", "");
    c.demoFailureRate = envDouble("DEMO_FAILURE_RATE", 0.05);
    c.maxAttempts     = envInt("MAX_ATTEMPTS", 3);
    c.ordersFile      = envStr("ORDERS_FILE", "orders.jsonl");
    c.telegramToken   = envStr("TELEGRAM_BOT_TOKEN", "");
    c.telegramChat    = envStr("TELEGRAM_CHAT_ID", "");
    if (c.maxAttempts < 1)  c.maxAttempts = 1;
    if (c.maxAttempts > 10) c.maxAttempts = 10;
    if (c.demoFailureRate < 0.0) c.demoFailureRate = 0.0;
    if (c.demoFailureRate > 1.0) c.demoFailureRate = 1.0;
    if (c.port < 1 || c.port > 65535) c.port = 8788;
    return c;
}

/* ===========================================================================
   6) SHA-256 + HMAC-SHA256 (stdlib only) — for X-Signature on live calls
   ========================================================================= */

namespace crypto {

static inline uint32_t rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32u - n));
}

static const uint32_t K[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
};

static std::array<unsigned char, 32> digest(const std::string& msg) {
    uint32_t h[8] = { 0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
                      0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u };

    std::vector<unsigned char> data(msg.begin(), msg.end());
    uint64_t bitlen = (uint64_t)data.size() * 8ull;
    data.push_back(0x80u);
    while (data.size() % 64 != 56) data.push_back(0x00u);
    for (int i = 7; i >= 0; --i) {
        data.push_back((unsigned char)((bitlen >> (i * 8)) & 0xFFull));
    }

    for (size_t off = 0; off < data.size(); off += 64) {
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) {
            w[i] = ((uint32_t)data[off + i * 4] << 24) |
                   ((uint32_t)data[off + i * 4 + 1] << 16) |
                   ((uint32_t)data[off + i * 4 + 2] << 8) |
                   ((uint32_t)data[off + i * 4 + 3]);
        }
        for (int i = 16; i < 64; ++i) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; ++i) {
            uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t ch = (e & f) ^ ((~e) & g);
            uint32_t t1 = hh + S1 + ch + K[i] + w[i];
            uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t t2 = S0 + maj;
            hh = g; g = f; f = e; e = d + t1;
            d = c;  c = b; b = a; a = t1 + t2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    std::array<unsigned char, 32> out;
    for (int i = 0; i < 8; ++i) {
        out[i * 4 + 0] = (unsigned char)((h[i] >> 24) & 0xFFu);
        out[i * 4 + 1] = (unsigned char)((h[i] >> 16) & 0xFFu);
        out[i * 4 + 2] = (unsigned char)((h[i] >> 8) & 0xFFu);
        out[i * 4 + 3] = (unsigned char)(h[i] & 0xFFu);
    }
    return out;
}

static std::string toHex(const unsigned char* d, size_t n) {
    static const char* hex = "0123456789abcdef";
    std::string o;
    o.reserve(n * 2);
    for (size_t i = 0; i < n; ++i) {
        o += hex[(d[i] >> 4) & 0x0F];
        o += hex[d[i] & 0x0F];
    }
    return o;
}

static std::string sha256Hex(const std::string& msg) {
    std::array<unsigned char, 32> d = digest(msg);
    return toHex(d.data(), d.size());
}

static std::string hmacSha256Hex(const std::string& key, const std::string& msg) {
    const size_t BLOCK = 64;
    std::string k = key;
    if (k.size() > BLOCK) {
        std::array<unsigned char, 32> kd = digest(k);
        k.assign((const char*)kd.data(), kd.size());
    }
    k.resize(BLOCK, '\0');

    std::string ipad(BLOCK, '\0');
    std::string opad(BLOCK, '\0');
    for (size_t i = 0; i < BLOCK; ++i) {
        unsigned char kb = (unsigned char)k[i];
        ipad[i] = (char)(kb ^ 0x36u);
        opad[i] = (char)(kb ^ 0x5Cu);
    }
    std::array<unsigned char, 32> inner = digest(ipad + msg);
    std::string innerStr((const char*)inner.data(), inner.size());
    std::array<unsigned char, 32> outer = digest(opad + innerStr);
    return toHex(outer.data(), outer.size());
}

}  // namespace crypto

/* ===========================================================================
   7) Minimal HTTP client (used by PROVIDER_MODE=live)
      NOTE: plain HTTP only. For an HTTPS provider, terminate TLS in a
      reverse proxy in front of this service (stdlib has no TLS).
   ========================================================================= */

struct HttpResp {
    bool ok = false;
    int status = 0;
    std::string body;
    std::string error;
};

static bool parseHostPort(const std::string& url, std::string& host, int& port,
                          std::string& path, bool& tls, std::string& err) {
    std::string u = url;
    tls = false;
    if (startsWith(u, "https://")) {
        tls = true;
        u = u.substr(8);
    } else if (startsWith(u, "http://")) {
        u = u.substr(7);
    }
    size_t slash = u.find('/');
    std::string hostport = (slash == std::string::npos) ? u : u.substr(0, slash);
    path = (slash == std::string::npos) ? std::string("/") : u.substr(slash);

    size_t colon = hostport.rfind(':');
    if (colon != std::string::npos) {
        host = hostport.substr(0, colon);
        try {
            port = std::stoi(hostport.substr(colon + 1));
        } catch (...) {
            err = "invalid port in PROVIDER_URL";
            return false;
        }
    } else {
        host = hostport;
        port = tls ? 443 : 80;
    }
    if (host.empty()) {
        err = "invalid host in PROVIDER_URL";
        return false;
    }
    return true;
}

static bool tcpConnect(const std::string& host, int port, sock_t& out, std::string& err) {
    struct addrinfo hints;
    std::memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;

    char portBuf[16];
    std::snprintf(portBuf, sizeof(portBuf), "%d", port);

    struct addrinfo* res = nullptr;
    if (getaddrinfo(host.c_str(), portBuf, &hints, &res) != 0 || res == nullptr) {
        err = "dns lookup failed for " + host;
        return false;
    }

    bool connected = false;
    for (struct addrinfo* ai = res; ai != nullptr; ai = ai->ai_next) {
        sock_t s = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (s == SHN_INVALID_SOCK) continue;
        if (::connect(s, ai->ai_addr, (int)ai->ai_addrlen) == 0) {
            out = s;
            connected = true;
            break;
        }
        shn_close_sock(s);
    }
    freeaddrinfo(res);
    if (!connected) err = "connect failed to " + host + ":" + portBuf;
    return connected;
}

static HttpResp httpPostJson(const std::string& url,
                             const std::string& body,
                             const std::vector<std::pair<std::string, std::string> >& headers) {
    HttpResp r;
    std::string host, path, err;
    int port = 80;
    bool tls = false;
    if (!parseHostPort(url, host, port, path, tls, err)) {
        r.error = err;
        return r;
    }
    if (tls) {
        r.error = "https is not supported by this build — use http:// + reverse proxy";
        return r;
    }

    sock_t s = SHN_INVALID_SOCK;
    if (!tcpConnect(host, port, s, err)) {
        r.error = err;
        return r;
    }

    std::ostringstream req;
    std::ostringstream hostHdr;
    hostHdr << host << ":" << port;
    req << "POST " << path << " HTTP/1.1\r\n";
    req << "Host: " << hostHdr.str() << "\r\n";
    req << "User-Agent: " << kServiceName << "/" << kVersion << "\r\n";
    req << "Content-Type: application/json; charset=utf-8\r\n";
    req << "Content-Length: " << body.size() << "\r\n";
    req << "Connection: close\r\n";
    for (size_t i = 0; i < headers.size(); ++i) {
        req << headers[i].first << ": " << headers[i].second << "\r\n";
    }
    req << "\r\n";
    req << body;

    std::string reqStr = req.str();
    size_t sentTotal = 0;
    while (sentTotal < reqStr.size()) {
        int n = ::send(s, reqStr.c_str() + sentTotal, (int)(reqStr.size() - sentTotal), 0);
        if (n <= 0) {
            shn_close_sock(s);
            r.error = "send failed";
            return r;
        }
        sentTotal += (size_t)n;
    }

    std::string raw;
    char buf[4096];
    for (;;) {
        int n = ::recv(s, buf, (int)sizeof(buf), 0);
        if (n <= 0) break;
        raw.append(buf, (size_t)n);
        if (raw.size() > 4u * 1024u * 1024u) break;
    }
    shn_close_sock(s);

    size_t sp = raw.find(' ');
    if (sp == std::string::npos) {
        r.error = "malformed http response";
        return r;
    }
    try {
        r.status = std::stoi(raw.substr(sp + 1, 3));
    } catch (...) {
        r.error = "malformed http status";
        return r;
    }
    size_t hdrEnd = raw.find("\r\n\r\n");
    if (hdrEnd != std::string::npos) {
        r.body = raw.substr(hdrEnd + 4);
    }
    r.ok = true;
    return r;
}

/* ===========================================================================
   8) Job model
   ========================================================================= */

struct TimelineEntry {
    std::string status;
    std::string at;
    std::string message;
};

struct Job {
    std::string jobId;
    std::string orderId;
    std::string idemKey;

    std::string game;
    std::string packageId;
    std::string packageLabel;
    std::string playerId;
    std::string region;

    double amount;
    std::string currency;

    std::string payMethod;
    std::string payRef;
    std::string payStatus;

    std::string custName;
    std::string custPhone;
    std::string custEmail;

    std::string status;
    int attempts;
    int progress;
    std::string providerRef;
    std::string message;
    std::string createdAt;
    std::string updatedAt;
    std::vector<TimelineEntry> timeline;

    Job() : amount(0.0), attempts(0), progress(0), status("queued") {}
};

static void pushTimeline(Job& j, const std::string& status, const std::string& message) {
    TimelineEntry e;
    e.status = status;
    e.at = isoNow();
    e.message = message;
    j.timeline.push_back(e);
}

static std::string timelineJson(const std::vector<TimelineEntry>& tl) {
    std::string s = "[";
    for (size_t i = 0; i < tl.size(); ++i) {
        if (i) s += ",";
        s += "{\"status\":" + jStr(tl[i].status) +
             ",\"at\":" + jStr(tl[i].at) +
             ",\"message\":" + jStr(tl[i].message) + "}";
    }
    s += "]";
    return s;
}

/* Full snapshot, written to orders.jsonl */
static std::string jobToLogLine(const Job& j) {
    std::string s = "{";
    s += "\"jobId\":" + jStr(j.jobId);
    s += ",\"orderId\":" + jStr(j.orderId);
    s += ",\"idempotencyKey\":" + jStr(j.idemKey);
    s += ",\"game\":" + jStr(j.game);
    s += ",\"package\":" + jStr(j.packageId);
    s += ",\"packageLabel\":" + jStr(j.packageLabel);
    s += ",\"playerId\":" + jStr(j.playerId);
    s += ",\"region\":" + jStr(j.region);
    s += ",\"amount\":" + jNum(j.amount);
    s += ",\"currency\":" + jStr(j.currency);
    s += ",\"paymentMethod\":" + jStr(j.payMethod);
    s += ",\"paymentReference\":" + jStr(j.payRef);
    s += ",\"paymentStatus\":" + jStr(j.payStatus);
    s += ",\"customerPhone\":" + jStr(j.custPhone);
    s += ",\"status\":" + jStr(j.status);
    s += ",\"attempts\":" + jInt(j.attempts);
    s += ",\"progress\":" + jInt(j.progress);
    s += ",\"providerRef\":" + jStrOrNull(j.providerRef);
    s += ",\"message\":" + jStr(j.message);
    s += ",\"createdAt\":" + jStr(j.createdAt);
    s += ",\"updatedAt\":" + jStr(j.updatedAt);
    s += ",\"timeline\":" + timelineJson(j.timeline);
    s += "}";
    return s;
}

/* GET /api/v1/topup/{jobId} payload, exact contract shape */
static std::string jobToPublicJson(const Job& j) {
    std::string s = "{";
    s += "\"ok\":true";
    s += ",\"jobId\":" + jStr(j.jobId);
    s += ",\"orderId\":" + jStr(j.orderId);
    s += ",\"status\":" + jStr(j.status);
    s += ",\"attempts\":" + jInt(j.attempts);
    s += ",\"progress\":" + jInt(j.progress);
    s += ",\"providerRef\":" + jStrOrNull(j.providerRef);
    s += ",\"message\":" + jStr(j.message);
    s += ",\"createdAt\":" + jStr(j.createdAt);
    s += ",\"updatedAt\":" + jStr(j.updatedAt);
    s += ",\"timeline\":" + timelineJson(j.timeline);
    s += "}";
    return s;
}

}  // namespace shn

namespace shn {

/* ===========================================================================
   9) Top-up engine — std::thread + std::mutex + queue
   ========================================================================= */

struct SubmitResult {
    bool ok = false;
    bool duplicate = false;
    std::string jobId;
    std::string orderId;
    std::string status;
    int attempts = 0;
    std::string errorCode;
};

class Engine {
public:
    explicit Engine(const Config& cfg)
        : cfg_(cfg),
          stopFlag_(false),
          seq_(0),
          idDay_(dayStamp()),
          started_(std::chrono::steady_clock::now()) {
        std::random_device rd;
        uint64_t seed = ((uint64_t)rd() << 32) ^ (uint64_t)rd();
        seed ^= (uint64_t)std::chrono::steady_clock::now().time_since_epoch().count();
        rng_.seed(seed);
    }

    ~Engine() { stop(); }

    void start() {
        loadOrders();
        worker_ = std::thread(&Engine::workerLoop, this);
    }

    void stop() {
        {
            std::lock_guard<std::mutex> lk(mu_);
            stopFlag_ = true;
        }
        cv_.notify_all();
        if (worker_.joinable()) worker_.join();
    }

    /* ---------------------------------------------------------------- submit */
    bool submit(const Job& in, SubmitResult& res) {
        Job logged;
        bool haveLogged = false;
        {
            std::lock_guard<std::mutex> lk(mu_);

            if (!in.idemKey.empty()) {
                std::unordered_map<std::string, std::string>::const_iterator it = idem_.find(in.idemKey);
                if (it != idem_.end()) {
                    std::unordered_map<std::string, Job>::const_iterator jt = jobs_.find(it->second);
                    if (jt != jobs_.end()) {
                        res.ok = true;
                        res.duplicate = true;
                        res.jobId = jt->second.jobId;
                        res.orderId = jt->second.orderId;
                        res.status = jt->second.status;
                        res.attempts = jt->second.attempts;
                        return true;
                    }
                }
            }

            if (pendingLocked() > 500) {
                res.ok = false;
                res.errorCode = "engine_busy";
                return false;
            }

            Job j = in;
            j.jobId = nextJobIdLocked();
            j.status = "queued";
            j.attempts = 0;
            j.progress = 0;
            j.providerRef.clear();
            j.message = "دخل الطابور";
            j.createdAt = isoNow();
            j.updatedAt = j.createdAt;
            j.timeline.clear();
            pushTimeline(j, "queued", "دخل الطابور");

            jobs_[j.jobId] = j;
            if (!j.idemKey.empty()) idem_[j.idemKey] = j.jobId;
            queue_.push_back(j.jobId);
            logged = j;
            haveLogged = true;

            res.ok = true;
            res.duplicate = false;
            res.jobId = j.jobId;
            res.orderId = j.orderId;
            res.status = "queued";
            res.attempts = 0;
        }
        if (haveLogged) appendLog(logged);
        cv_.notify_all();
        return true;
    }

    /* ----------------------------------------------------------------- reads */
    bool getJob(const std::string& jobId, Job& out) const {
        std::lock_guard<std::mutex> lk(mu_);
        std::unordered_map<std::string, Job>::const_iterator it = jobs_.find(jobId);
        if (it == jobs_.end()) return false;
        out = it->second;
        return true;
    }

    bool findByIdemKey(const std::string& key, Job& out) const {
        std::lock_guard<std::mutex> lk(mu_);
        std::unordered_map<std::string, std::string>::const_iterator it = idem_.find(key);
        if (it == idem_.end()) return false;
        std::unordered_map<std::string, Job>::const_iterator jt = jobs_.find(it->second);
        if (jt == jobs_.end()) return false;
        out = jt->second;
        return true;
    }

    void counts(long long& total, long long& queued, long long& processing,
                long long& delivered, long long& failed) const {
        total = queued = processing = delivered = failed = 0;
        std::lock_guard<std::mutex> lk(mu_);
        for (std::unordered_map<std::string, Job>::const_iterator it = jobs_.begin();
             it != jobs_.end(); ++it) {
            const std::string& s = it->second.status;
            ++total;
            if (s == "queued") {
                ++queued;
            } else if (s == "processing" || s == "retrying") {
                ++processing;
            } else if (s == "delivered") {
                ++delivered;
            } else {
                ++failed;  // failed + review + anything unknown
            }
        }
    }

    size_t pendingCount() const {
        std::lock_guard<std::mutex> lk(mu_);
        return pendingLocked();
    }

    std::string mode() const { return cfg_.providerMode; }
    const Config& config() const { return cfg_; }

    long long uptimeSec() const {
        return (long long)std::chrono::duration_cast<std::chrono::seconds>(
                   std::chrono::steady_clock::now() - started_).count();
    }

    /* Exposed for the offline selftest: escalating retry backoff, in seconds. */
    int backoffSecondsForTest(int attempt) const { return backoffSeconds(attempt); }

    /* Number of jobs currently being processed (for selftest diagnostics) */
    bool waitUntilTerminal(const std::string& jobId, int timeoutMs) const {
        int waited = 0;
        while (waited < timeoutMs) {
            Job j;
            if (getJob(jobId, j)) {
                if (j.status == "delivered" || j.status == "failed" || j.status == "review") {
                    return true;
                }
            }
            sleepMs(10);
            waited += 10;
        }
        return false;
    }

private:
    Config cfg_;

    mutable std::mutex mu_;
    std::condition_variable cv_;
    std::deque<std::string> queue_;
    std::unordered_map<std::string, Job> jobs_;
    std::unordered_map<std::string, std::string> idem_;

    std::thread worker_;
    bool stopFlag_;
    int seq_;
    std::string idDay_;

    mutable std::mutex fileMu_;
    std::chrono::steady_clock::time_point started_;

    mutable std::mutex rngMu_;
    std::mt19937 rng_;

    /* -------------------------------------------------------------- helpers */
    std::string nextJobIdLocked() {
        std::string d = dayStamp();
        if (d != idDay_) {
            idDay_ = d;
            seq_ = 0;
        }
        ++seq_;
        return "JOB-" + d + "-" + pad4(seq_);
    }

    size_t pendingLocked() const {
        size_t n = 0;
        for (std::unordered_map<std::string, Job>::const_iterator it = jobs_.begin();
             it != jobs_.end(); ++it) {
            const std::string& s = it->second.status;
            if (s == "queued" || s == "processing" || s == "retrying") ++n;
        }
        return n;
    }

    void appendLog(const Job& j) {
        std::lock_guard<std::mutex> lk(fileMu_);
        std::ofstream f(cfg_.ordersFile.c_str(), std::ios::out | std::ios::app | std::ios::binary);
        if (!f) return;
        f << jobToLogLine(j) << "\n";
        f.flush();
    }

    template <class F>
    void mutate(const std::string& jid, F fn) {
        Job snapshot;
        {
            std::lock_guard<std::mutex> lk(mu_);
            std::unordered_map<std::string, Job>::iterator it = jobs_.find(jid);
            if (it == jobs_.end()) return;
            fn(it->second);
            it->second.updatedAt = isoNow();
            snapshot = it->second;
        }
        appendLog(snapshot);
    }

    double uniform01() {
        std::lock_guard<std::mutex> lk(rngMu_);
        std::uniform_real_distribution<double> d(0.0, 1.0);
        return d(rng_);
    }

    std::string makeProviderRef() {
        std::lock_guard<std::mutex> lk(rngMu_);
        std::uniform_int_distribution<int> d(1000, 9999);
        return "PRV-DEMO-" + std::to_string(d(rng_));
    }

    /* escalating backoff — live: 2s -> 4s -> 8s | demo: 1s -> 2s -> 3s */
    int backoffSeconds(int attempt) const {
        static const int live[3] = { 2, 4, 8 };
        static const int demo[3] = { 1, 2, 3 };
        int idx = attempt - 1;
        if (idx < 0) idx = 0;
        if (idx > 2) idx = 2;
        return (cfg_.providerMode == "live") ? live[idx] : demo[idx];
    }

    /* --------------------------------------------------------------- worker */
    void workerLoop() {
        for (;;) {
            std::string jid;
            {
                std::unique_lock<std::mutex> lk(mu_);
                cv_.wait(lk, [this] { return stopFlag_ || !queue_.empty(); });
                if (queue_.empty()) {
                    if (stopFlag_) return;
                    continue;
                }
                jid = queue_.front();
                queue_.pop_front();
            }
            if (!jid.empty()) processJob(jid);
        }
    }

    void processJob(const std::string& jid) {
        const int maxA = cfg_.maxAttempts;
        const std::string ref = makeProviderRef();

        for (int attempt = 1; attempt <= maxA; ++attempt) {
            const int cap = attempt;
            mutate(jid, [cap](Job& j) {
                j.status = "processing";
                j.attempts = cap;
                j.progress = 60;
                j.message = "محاولة " + std::to_string(cap);
                pushTimeline(j, "processing", "محاولة " + std::to_string(cap));
            });

            if (cfg_.providerMode == "demo" && !cfg_.forceSuccess && !cfg_.forceFail) {
                sleepMs(cfg_.fastMode ? 5 : 700);  // simulate provider latency
            }

            bool ok = providerCall(jid);

            if (ok) {
                mutate(jid, [cap, &ref](Job& j) {
                    j.status = "delivered";
                    j.attempts = cap;
                    j.progress = 100;
                    j.providerRef = ref;
                    j.message = "تم الشحن بنجاح";
                    pushTimeline(j, "delivered", "تم الشحن بنجاح");
                });
                return;
            }

            if (attempt < maxA) {
                const int next = attempt + 1;
                const int waitSec = backoffSeconds(attempt);
                mutate(jid, [cap, next](Job& j) {
                    j.status = "retrying";
                    j.attempts = cap;
                    j.progress = 50;
                    j.message = "فشل مؤقت — إعادة المحاولة " + std::to_string(next);
                    pushTimeline(j, "retrying", "فشل مؤقت — إعادة المحاولة " + std::to_string(next));
                });
                sleepMs(cfg_.fastMode ? 5 : (long long)waitSec * 1000);
            } else {
                mutate(jid, [cap](Job& j) {
                    j.status = "failed";
                    j.attempts = cap;
                    j.progress = 100;
                    j.message = "فشل بعد كل المحاولات — يحتاج مراجعة";
                    pushTimeline(j, "failed", "فشل بعد كل المحاولات — يحتاج مراجعة");
                });
                return;
            }
        }
    }

    bool providerCall(const std::string& jid) {
        if (cfg_.forceSuccess) return true;
        if (cfg_.forceFail) return false;
        if (cfg_.providerMode == "live" && !cfg_.providerUrl.empty()) {
            return liveProviderCall(jid);
        }
        return uniform01() >= cfg_.demoFailureRate;
    }

    bool liveProviderCall(const std::string& jid) {
        Job snap;
        if (!getJob(jid, snap)) return false;

        std::string body;
        body += "{";
        body += "\"jobId\":" + jStr(snap.jobId);
        body += ",\"orderId\":" + jStr(snap.orderId);
        body += ",\"game\":" + jStr(snap.game);
        body += ",\"package\":" + jStr(snap.packageId);
        body += ",\"playerId\":" + jStr(snap.playerId);
        body += ",\"region\":" + jStr(snap.region);
        body += ",\"amount\":" + jNum(snap.amount);
        body += ",\"currency\":" + jStr(snap.currency);
        body += "}";

        std::vector<std::pair<std::string, std::string> > headers;
        if (!cfg_.providerKey.empty()) {
            headers.push_back(std::make_pair(std::string("X-Signature"),
                                             crypto::hmacSha256Hex(cfg_.providerKey, body)));
        }
        HttpResp r = httpPostJson(cfg_.providerUrl, body, headers);
        if (!r.ok) return false;
        return (r.status >= 200 && r.status < 300);
    }

    /* ---------------------------------------------------------------- load */
    void loadOrders() {
        std::vector<Job> rewritten;

        {
            std::ifstream f(cfg_.ordersFile.c_str(), std::ios::in | std::ios::binary);
            if (!f) return;

            std::lock_guard<std::mutex> lk(mu_);
            std::string line;
            while (std::getline(f, line)) {
                std::string t = trim(line);
                if (t.empty()) continue;

                Json doc;
                std::string err;
                JsonParser parser(t);
                if (!parser.parse(doc, err)) continue;

                std::string jid = doc.getStr("jobId");
                if (jid.empty()) continue;

                Job j;
                j.jobId       = jid;
                j.orderId     = doc.getStr("orderId");
                j.idemKey     = doc.getStr("idempotencyKey");
                j.game        = doc.getStr("game");
                j.packageId   = doc.getStr("package");
                j.packageLabel= doc.getStr("packageLabel");
                j.playerId    = doc.getStr("playerId");
                j.region      = doc.getStr("region");
                j.amount      = doc.getNum("amount", 0.0);
                j.currency    = doc.getStr("currency");
                j.payMethod   = doc.getStr("paymentMethod");
                j.payRef      = doc.getStr("paymentReference");
                j.payStatus   = doc.getStr("paymentStatus");
                j.custPhone   = doc.getStr("customerPhone");
                j.status      = doc.getStr("status", "failed");
                j.attempts    = (int)doc.getNum("attempts", 0);
                j.progress    = (int)doc.getNum("progress", 0);
                j.providerRef = doc.getStr("providerRef");
                j.message     = doc.getStr("message");
                j.createdAt   = doc.getStr("createdAt");
                j.updatedAt   = doc.getStr("updatedAt");

                const Json* tl = doc.find("timeline");
                if (tl && tl->isArr()) {
                    for (size_t i = 0; i < tl->arr.size(); ++i) {
                        TimelineEntry e;
                        e.status  = tl->arr[i].getStr("status");
                        e.at      = tl->arr[i].getStr("at");
                        e.message = tl->arr[i].getStr("message");
                        j.timeline.push_back(e);
                    }
                }

                if (!j.idemKey.empty()) idem_[j.idemKey] = jid;
                jobs_[jid] = j;

                // keep the job sequence monotonic across restarts
                size_t dash = jid.rfind('-');
                if (dash != std::string::npos) {
                    std::string num = jid.substr(dash + 1);
                    try {
                        int n = std::stoi(num);
                        if (n > seq_) seq_ = n;
                    } catch (...) {
                    }
                }
            }

            // jobs interrupted by a restart cannot be resumed automatically
            for (std::unordered_map<std::string, Job>::iterator it = jobs_.begin();
                 it != jobs_.end(); ++it) {
                Job& j = it->second;
                if (j.status == "queued" || j.status == "processing" || j.status == "retrying") {
                    j.status = "failed";
                    j.progress = 100;
                    j.message = "توقف التنفيذ بسبب إعادة تشغيل الخدمة — يحتاج مراجعة";
                    j.updatedAt = isoNow();
                    pushTimeline(j, "failed", j.message);
                    rewritten.push_back(j);
                }
            }
        }

        for (size_t i = 0; i < rewritten.size(); ++i) appendLog(rewritten[i]);
    }
};

}  // namespace shn

namespace shn {

/* ===========================================================================
   10) HTTP request / response plumbing
   ========================================================================= */

struct HttpRequest {
    std::string method;
    std::string rawTarget;
    std::string path;
    std::string query;
    std::string body;
};

struct HttpResponse {
    int status = 200;
    std::string statusText = "OK";
    std::string body;
};

static const char* statusTextFor(int code) {
    switch (code) {
        case 200: return "OK";
        case 202: return "Accepted";
        case 204: return "No Content";
        case 400: return "Bad Request";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 422: return "Unprocessable Entity";
        case 500: return "Internal Server Error";
        case 503: return "Service Unavailable";
        default:  return "OK";
    }
}

static HttpResponse okJson(const std::string& body) {
    HttpResponse r;
    r.status = 200;
    r.statusText = "OK";
    r.body = body;
    return r;
}

static HttpResponse errResp(int status, const std::string& code, const std::string& message) {
    HttpResponse r;
    r.status = status;
    r.statusText = statusTextFor(status);
    r.body = "{\"ok\":false,\"error\":{\"code\":" + jStr(code) +
             ",\"message\":" + jStr(message) + ",\"details\":[]}}";
    return r;
}

static HttpResponse errRespDetails(int status, const std::string& code,
                                  const std::string& message, const std::string& details) {
    HttpResponse r;
    r.status = status;
    r.statusText = statusTextFor(status);
    r.body = "{\"ok\":false,\"error\":{\"code\":" + jStr(code) +
             ",\"message\":" + jStr(message) + ",\"details\":" + details + "}}";
    return r;
}

static std::string urlDecode(const std::string& in) {
    std::string out;
    out.reserve(in.size());
    for (size_t i = 0; i < in.size(); ++i) {
        if (in[i] == '%' && i + 2 < in.size()) {
            int hi = 0, lo = 0;
            char a = in[i + 1], b = in[i + 2];
            if (a >= '0' && a <= '9') hi = a - '0';
            else if (a >= 'a' && a <= 'f') hi = a - 'a' + 10;
            else if (a >= 'A' && a <= 'F') hi = a - 'A' + 10;
            else { out += in[i]; continue; }
            if (b >= '0' && b <= '9') lo = b - '0';
            else if (b >= 'a' && b <= 'f') lo = b - 'a' + 10;
            else if (b >= 'A' && b <= 'F') lo = b - 'A' + 10;
            else { out += in[i]; continue; }
            out += (char)((hi << 4) | lo);
            i += 2;
        } else if (in[i] == '+') {
            out += ' ';
        } else {
            out += in[i];
        }
    }
    return out;
}

/* ===========================================================================
   11) Application (routing + endpoint handlers)
   ========================================================================= */

struct FieldError {
    std::string field;
    std::string code;
    std::string message;
};

static std::string fieldErrorsJson(const std::vector<FieldError>& v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) s += ",";
        s += "{\"field\":" + jStr(v[i].field) +
             ",\"code\":" + jStr(v[i].code) +
             ",\"message\":" + jStr(v[i].message) + "}";
    }
    s += "]";
    return s;
}

static std::string stringsJson(const std::vector<std::string>& v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) s += ",";
        s += jStr(v[i]);
    }
    s += "]";
    return s;
}

static std::string phoneErrorCode(const ValResult& r) {
    if (r.reason == "empty") return "required";
    if (r.reason == "short" || r.reason == "long") return "invalid_length";
    return "invalid_pattern";
}

static std::string phoneErrorMessage(const ValResult& r, const Country& c) {
    if (r.reason == "empty") return "رقم الهاتف مطلوب";
    if (r.reason == "short" || r.reason == "long") {
        return "عدد أرقام الرقم غير صحيح لـ " + c.ar +
               " (من " + std::to_string(c.mn) + " لـ " + std::to_string(c.mx) + ")";
    }
    return "الرقم مش مطابق لصيغة " + c.ar;
}

static int etaSecondsFor(int attempts, const std::string& mode) {
    int base = (mode == "live") ? 16 : 12;
    int v = base - attempts * 4;
    if (v < 0) v = 0;
    return v;
}

class App {
public:
    explicit App(const Config& cfg) : cfg_(cfg), engine_(cfg) {}

    void start() { engine_.start(); }
    void stop()  { engine_.stop(); }

    HttpResponse handle(const HttpRequest& req) {
        const std::string base = "/api/v1";
        const std::string& m = req.method;
        const std::string& p = req.path;

        if (m == "OPTIONS") {
            HttpResponse r;
            r.status = 204;
            r.statusText = "No Content";
            return r;
        }

        if (p == base + "/health" && m == "GET") {
            return okJson(healthJson());
        }
        if (p == base + "/countries" && m == "GET") {
            return okJson(countriesJson());
        }
        if (p == base + "/validate" && m == "POST") {
            return handleValidate(req.body);
        }
        if (p == base + "/topup" && m == "POST") {
            return handleTopup(req.body);
        }
        if (startsWith(p, base + "/topup/") && m == "GET") {
            std::string jobId = urlDecode(p.substr((base + "/topup/").size()));
            if (jobId.empty()) return errResp(404, "job_not_found", "الوظيفة مش موجودة");
            Job j;
            if (!engine_.getJob(jobId, j)) {
                return errResp(404, "job_not_found", "الوظيفة مش موجودة");
            }
            return okJson(jobToPublicJson(j));
        }

        return errResp(404, "not_found", "المسار غير موجود");
    }

private:
    Config cfg_;
    Engine engine_;

    /* --------------------------------------------------------------- health */
    std::string healthJson() const {
        long long total = 0, queued = 0, processing = 0, delivered = 0, failed = 0;
        engine_.counts(total, queued, processing, delivered, failed);
        std::string s = "{";
        s += "\"ok\":true";
        s += ",\"service\":" + jStr(kServiceName);
        s += ",\"version\":" + jStr(kVersion);
        s += ",\"uptimeSec\":" + jInt(engine_.uptimeSec());
        s += ",\"mode\":" + jStr(cfg_.providerMode);
        s += ",\"jobs\":{\"total\":" + jInt(total) +
             ",\"queued\":" + jInt(queued) +
             ",\"processing\":" + jInt(processing) +
             ",\"delivered\":" + jInt(delivered) +
             ",\"failed\":" + jInt(failed) + "}";
        s += "}";
        return s;
    }

    /* ------------------------------------------------------------ countries */
    std::string countriesJson() const {
        const std::vector<Country>& l = countryTable();
        std::string s = "{\"ok\":true,\"count\":" + jInt((long long)l.size()) + ",\"countries\":[";
        for (size_t i = 0; i < l.size(); ++i) {
            const Country& c = l[i];
            if (i) s += ",";
            s += "{";
            s += "\"code\":" + jStr(c.c);
            s += ",\"name\":" + jStr(c.ar);
            s += ",\"nameEn\":" + jStr(c.en);
            s += ",\"flag\":" + jStr(c.f);
            s += ",\"dial\":" + jStr(c.dial);
            s += ",\"minDigits\":" + jInt(c.mn);
            s += ",\"maxDigits\":" + jInt(c.mx);
            s += ",\"pattern\":" + jStr(c.pat);
            s += ",\"example\":" + jStr(c.ex);
            s += ",\"zone\":" + jStr(c.zone);
            s += ",\"currency\":{\"code\":" + jStr(c.cur.code) +
                 ",\"symbol\":" + jStr(c.cur.sym) +
                 ",\"decimals\":" + jInt(c.cur.dec) +
                 ",\"rate\":" + jNum(c.cur.rate) +
                 ",\"position\":" + jStr(c.cur.pos) + "}";
            s += "}";
        }
        s += "]}";
        return s;
    }

    /* ------------------------------------------------------------- validate */
    HttpResponse handleValidate(const std::string& bodyStr) {
        Json body;
        std::string err;
        JsonParser parser(bodyStr);
        if (!parser.parse(body, err) || !body.isObj()) {
            return errResp(400, "invalid_json", "الجسم مش JSON صحيح");
        }

        const std::string countryIn = trim(body.getStr("country"));
        const std::string phone     = trim(body.getStr("phone"));
        const std::string playerId  = trim(body.getStr("playerId"));

        std::vector<FieldError> errors;
        std::vector<std::string> warnings;

        bool phoneOk = false;
        std::string phoneE164;
        std::string resolvedCode;

        const Country* c = countryIn.empty() ? nullptr : byCode(countryIn);

        if (phone.empty()) {
            FieldError fe;
            fe.field = "phone";
            fe.code = "required";
            fe.message = "رقم الهاتف مطلوب";
            errors.push_back(fe);
        } else if (c != nullptr) {
            ValResult r = validatePhone(phone, *c);
            if (r.ok) {
                phoneOk = true;
                phoneE164 = r.e164;
                resolvedCode = c->c;
            } else {
                FieldError fe;
                fe.field = "phone";
                fe.code = phoneErrorCode(r);
                fe.message = phoneErrorMessage(r, *c);
                errors.push_back(fe);
            }
        } else {
            const Country* det = nullptr;
            std::string detE164;
            if (detectCountry(phone, det, detE164)) {
                phoneOk = true;
                phoneE164 = detE164;
                resolvedCode = det->c;
            } else {
                GenericResult g = validateGeneric(phone);
                if (g.ok) {
                    phoneOk = true;
                    phoneE164 = g.e164;
                    warnings.push_back("رقم من دولة خارج الجدول — تم قبوله بصيغة E.164");
                } else {
                    FieldError fe;
                    fe.field = "phone";
                    fe.code = "invalid_length";
                    fe.message = "الرقم لازم يكون بصيغة دولية E.164 (من 6 لـ 15 رقم)";
                    errors.push_back(fe);
                }
            }
        }

        validatePlayerIdField(playerId, errors);

        bool valid = errors.empty();

        std::string s = "{";
        s += "\"ok\":true";
        s += ",\"valid\":" + jBool(valid);
        s += ",\"country\":" + (resolvedCode.empty() ? std::string("null") : jStr(resolvedCode));
        s += ",\"phoneE164\":" + (phoneOk ? jStr(phoneE164) : std::string("null"));
        s += ",\"playerId\":" + jStr(playerId);
        s += ",\"errors\":" + fieldErrorsJson(errors);
        s += ",\"warnings\":" + stringsJson(warnings);
        s += "}";
        return okJson(s);
    }

public:
    static void validatePlayerIdField(const std::string& playerId,
                                      std::vector<FieldError>& errors) {
        FieldError fe;
        fe.field = "playerId";
        if (playerId.empty()) {
            fe.code = "required";
            fe.message = "آيدي اللاعب مطلوب";
            errors.push_back(fe);
            return;
        }
        bool badChars = false;
        for (size_t i = 0; i < playerId.size(); ++i) {
            char ch = playerId[i];
            if (ch >= '0' && ch <= '9') continue;
            if (ch == ' ' || ch == '-' || ch == '_') continue;
            badChars = true;
            break;
        }
        if (badChars) {
            fe.code = "invalid_format";
            fe.message = "آيدي اللاعب لازم يكون أرقام فقط";
            errors.push_back(fe);
            return;
        }
        std::string d = onlyDigits(playerId);
        if (d.size() < 8 || d.size() > 12) {
            fe.code = "invalid_length";
            fe.message = "آيدي اللاعب لازم من 8 لـ 12 رقم";
            errors.push_back(fe);
        }
    }

private:
    /* ---------------------------------------------------------------- topup */
    HttpResponse handleTopup(const std::string& bodyStr) {
        Json body;
        std::string err;
        JsonParser parser(bodyStr);
        if (!parser.parse(body, err) || !body.isObj()) {
            return errResp(400, "invalid_json", "الجسم مش JSON صحيح");
        }

        const std::string orderId  = trim(body.getStr("orderId"));
        const std::string game     = trim(body.getStr("game"));
        const std::string playerId = trim(body.getStr("playerId"));
        const std::string region   = toUpper(trim(body.getStr("region")));

        std::vector<std::string> missing;
        if (orderId.empty())  missing.push_back("orderId");
        if (game.empty())     missing.push_back("game");
        if (playerId.empty()) missing.push_back("playerId");

        if (!missing.empty()) {
            std::string details = "[";
            for (size_t i = 0; i < missing.size(); ++i) {
                if (i) details += ",";
                details += "{\"field\":" + jStr(missing[i]) + ",\"code\":\"required\"}";
            }
            details += "]";
            std::string joined;
            for (size_t i = 0; i < missing.size(); ++i) {
                if (i) joined += ", ";
                joined += missing[i];
            }
            return errRespDetails(400, "invalid_input", "حقول ناقصة: " + joined, details);
        }

        /* --- validation (HTTP 422 on failure) --- */
        const Json* customer = body.find("customer");
        const std::string custPhone = customer ? trim(customer->getStr("phone")) : "";

        std::vector<FieldError> errors;
        const Country* c = byCode(region);

        if (!custPhone.empty()) {
            if (c != nullptr) {
                ValResult r = validatePhone(custPhone, *c);
                if (!r.ok) {
                    FieldError fe;
                    fe.field = "phone";
                    fe.code = phoneErrorCode(r);
                    fe.message = phoneErrorMessage(r, *c);
                    errors.push_back(fe);
                }
            } else {
                const Country* det = nullptr;
                std::string detE164;
                if (!detectCountry(custPhone, det, detE164)) {
                    GenericResult g = validateGeneric(custPhone);
                    if (!g.ok) {
                        FieldError fe;
                        fe.field = "phone";
                        fe.code = "invalid_length";
                        fe.message = "الرقم لازم يكون بصيغة دولية E.164 (من 6 لـ 15 رقم)";
                        errors.push_back(fe);
                    }
                }
            }
        }

        validatePlayerIdField(playerId, errors);

        if (!errors.empty()) {
            return errRespDetails(422, "validation_failed",
                                  "فشل التحقق من بيانات الطلب",
                                  fieldErrorsJson(errors));
        }

        /* --- build the job --- */
        Job j;
        j.orderId      = orderId;
        j.game         = game;
        j.packageId    = body.getStr("package");
        j.packageLabel = body.getStr("packageLabel");
        j.playerId     = onlyDigits(playerId).empty() ? playerId : onlyDigits(playerId);
        j.region       = region;
        j.amount       = body.getNum("amount", 0.0);
        j.currency     = body.getStr("currency", "EGP");

        const Json* pay = body.find("payment");
        if (pay) {
            j.payMethod = pay->getStr("method");
            j.payRef    = pay->getStr("reference");
            j.payStatus = pay->getStr("status");
        }
        if (customer) {
            j.custName  = customer->getStr("name");
            j.custPhone = custPhone;
            j.custEmail = customer->getStr("email");
        }

        j.idemKey = trim(body.getStr("idempotencyKey"));
        if (j.idemKey.empty()) j.idemKey = orderId;  // never top up the same order twice

        SubmitResult res;
        if (!engine_.submit(j, res)) {
            if (res.errorCode == "engine_busy") {
                return errResp(503, "engine_busy", "الطابور ممتلي — جرّب تاني بعد شوية");
            }
            return errResp(500, "provider_error", "خطأ داخلي في محرك الشحن");
        }

        std::string s = "{";
        s += "\"ok\":true";
        s += ",\"jobId\":" + jStr(res.jobId);
        s += ",\"orderId\":" + jStr(res.orderId);
        s += ",\"status\":" + jStr(res.status);
        s += ",\"attempts\":" + jInt(res.attempts);
        s += ",\"etaSeconds\":" + jInt(etaSecondsFor(res.attempts, cfg_.providerMode));
        s += ",\"duplicate\":" + jBool(res.duplicate);
        s += "}";

        HttpResponse r;
        r.status = res.duplicate ? 200 : 202;
        r.statusText = res.duplicate ? "OK" : "Accepted";
        r.body = s;
        return r;
    }
};

/* ===========================================================================
   12) HTTP server (WinSock2 / POSIX)
   ========================================================================= */

static bool sendAll(sock_t s, const std::string& data) {
    size_t sent = 0;
    while (sent < data.size()) {
        int n = ::send(s, data.c_str() + sent, (int)(data.size() - sent), 0);
        if (n <= 0) return false;
        sent += (size_t)n;
    }
    return true;
}

class HttpServer {
public:
    HttpServer(int port, App* app) : port_(port), app_(app), listenSock_(SHN_INVALID_SOCK) {}

    bool start(std::string& err) {
        listenSock_ = ::socket(AF_INET, SOCK_STREAM, 0);
        if (listenSock_ == SHN_INVALID_SOCK) {
            err = "socket() failed";
            return false;
        }

        int opt = 1;
#ifdef _WIN32
        setsockopt(listenSock_, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, (int)sizeof(opt));
#else
        setsockopt(listenSock_, SOL_SOCKET, SO_REUSEADDR, &opt, (socklen_t)sizeof(opt));
#endif

        struct sockaddr_in addr;
        std::memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_ANY);
        addr.sin_port = htons((unsigned short)port_);

        if (::bind(listenSock_, (struct sockaddr*)&addr, (int)sizeof(addr)) != 0) {
            err = "bind() failed on port " + std::to_string(port_);
            shn_close_sock(listenSock_);
            listenSock_ = SHN_INVALID_SOCK;
            return false;
        }
        if (::listen(listenSock_, 128) != 0) {
            err = "listen() failed";
            shn_close_sock(listenSock_);
            listenSock_ = SHN_INVALID_SOCK;
            return false;
        }
        return true;
    }

    void run() {
        for (;;) {
#ifdef _WIN32
            int clen = (int)sizeof(struct sockaddr_in);
#else
            socklen_t clen = (socklen_t)sizeof(struct sockaddr_in);
#endif
            struct sockaddr_in cli;
            std::memset(&cli, 0, sizeof(cli));
            sock_t c = ::accept(listenSock_, (struct sockaddr*)&cli, &clen);
            if (c == SHN_INVALID_SOCK) {
                continue;
            }
            std::thread(&HttpServer::handleClient, this, c).detach();
        }
    }

private:
    int port_;
    App* app_;
    sock_t listenSock_;

    static size_t parseContentLength(const std::string& headers) {
        std::string lower = toLower(headers);
        size_t pos = lower.find("content-length:");
        if (pos == std::string::npos) return 0;
        pos += std::strlen("content-length:");
        size_t end = headers.find("\r\n", pos);
        std::string val = trim(headers.substr(pos, (end == std::string::npos) ? std::string::npos
                                                                             : end - pos));
        try {
            long long n = std::stoll(val);
            return (n > 0) ? (size_t)n : 0;
        } catch (...) {
            return 0;
        }
    }

    void handleClient(sock_t c) {
        std::string raw;
        char buf[4096];
        size_t headerEnd = std::string::npos;
        size_t contentLength = 0;
        bool headersReady = false;

        for (;;) {
            int n = ::recv(c, buf, (int)sizeof(buf), 0);
            if (n <= 0) break;
            raw.append(buf, (size_t)n);

            if (!headersReady) {
                headerEnd = raw.find("\r\n\r\n");
                if (headerEnd != std::string::npos) {
                    headersReady = true;
                    contentLength = parseContentLength(raw.substr(0, headerEnd));
                }
            }
            if (headersReady) {
                size_t have = raw.size() - (headerEnd + 4);
                if (have >= contentLength) break;
            }
            if (raw.size() > 8u * 1024u * 1024u) break;
        }

        HttpResponse resp;
        if (headerEnd == std::string::npos) {
            resp = errResp(400, "invalid_json", "طلب غير صالح");
        } else {
            HttpRequest req;
            std::string head = raw.substr(0, headerEnd);
            size_t lineEnd = head.find("\r\n");
            std::string reqLine = (lineEnd == std::string::npos) ? head : head.substr(0, lineEnd);

            std::istringstream ls(reqLine);
            std::string version;
            ls >> req.method >> req.rawTarget >> version;

            size_t q = req.rawTarget.find('?');
            if (q == std::string::npos) {
                req.path = req.rawTarget;
            } else {
                req.path = req.rawTarget.substr(0, q);
                req.query = req.rawTarget.substr(q + 1);
            }
            if (req.path.empty()) req.path = "/";

            if (headerEnd + 4 <= raw.size()) {
                req.body = raw.substr(headerEnd + 4);
            }

            if (req.method.empty()) {
                resp = errResp(400, "invalid_json", "طلب غير صالح");
            } else {
                try {
                    resp = app_->handle(req);
                } catch (const std::exception&) {
                    resp = errResp(500, "provider_error", "خطأ داخلي");
                } catch (...) {
                    resp = errResp(500, "provider_error", "خطأ داخلي");
                }
            }
        }

        std::ostringstream out;
        out << "HTTP/1.1 " << resp.status << " " << resp.statusText << "\r\n";
        out << "Content-Type: application/json; charset=utf-8\r\n";
        out << "Content-Length: " << resp.body.size() << "\r\n";
        out << "Access-Control-Allow-Origin: *\r\n";
        out << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
        out << "Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-Signature\r\n";
        out << "Cache-Control: no-store\r\n";
        out << "Connection: close\r\n\r\n";
        out << resp.body;

        sendAll(c, out.str());
        shn_close_sock(c);
    }
};

/* ===========================================================================
   13) Server entry point
   ========================================================================= */

static int runServer(const Config& cfg) {
    App app(cfg);
    app.start();

    HttpServer server(cfg.port, &app);
    std::string err;
    if (!server.start(err)) {
        std::cerr << "[error] " << err << "\n";
        app.stop();
        return 1;
    }

    std::cout << kServiceName << " " << kVersion << " listening on "
              << "http://127.0.0.1:" << cfg.port << "/api/v1\n";
    std::cout << "  mode=" << cfg.providerMode
              << "  maxAttempts=" << cfg.maxAttempts
              << "  ordersFile=" << cfg.ordersFile << "\n";
    std::cout << "  endpoints: /api/v1/health  /api/v1/countries  /api/v1/validate"
              << "  /api/v1/topup  /api/v1/topup/{jobId}\n";
    std::cout.flush();

    server.run();
    app.stop();
    return 0;
}

/* ===========================================================================
   14) --selftest (offline, no network)
   ========================================================================= */

static int runSelftest() {
    int passed = 0;
    int failed = 0;

    struct Reporter {
        int* p;
        int* f;
        void check(bool ok, const std::string& name) {
            if (ok) {
                ++(*p);
                std::cout << "PASS  " << name << "\n";
            } else {
                ++(*f);
                std::cout << "FAIL  " << name << "\n";
            }
        }
    } rep;
    rep.p = &passed;
    rep.f = &failed;

    std::cout << "=== shahnly-topup-cpp selftest (offline) ===\n";

    /* -------------------- 1. phone validation -------------------- */
    const Country* eg = byCode("EG");
    const Country* sa = byCode("SA");
    const Country* gb = byCode("GB");
    const Country* us = byCode("US");

    rep.check(eg != nullptr && sa != nullptr && gb != nullptr && us != nullptr,
              "country table exposes EG / SA / GB / US");

    if (eg) {
        ValResult r = validatePhone("01012345678", *eg);
        rep.check(r.ok && r.e164 == "+201012345678",
                  "EG local number 01012345678 -> +201012345678");
    }
    if (eg) {
        ValResult r = validatePhone("+201012345678", *eg);
        rep.check(r.ok && r.e164 == "+201012345678",
                  "EG international number +201012345678 accepted");
    }
    if (sa) {
        ValResult r = validatePhone("+966512345678", *sa);
        rep.check(r.ok && r.e164 == "+966512345678",
                  "SA number +966512345678 -> +966512345678");
    }
    if (gb) {
        ValResult r = validatePhone("+447123456789", *gb);
        rep.check(r.ok && r.e164 == "+447123456789",
                  "GB number +447123456789 accepted");
    }
    if (us) {
        ValResult r = validatePhone("+12025550123", *us);
        rep.check(r.ok && r.e164 == "+12025550123",
                  "US number +12025550123 accepted");
    }

    /* -------------------- 2. rejection cases -------------------- */
    if (eg) {
        ValResult r = validatePhone("123", *eg);
        rep.check(!r.ok && r.reason == "short", "reject too-short EG number 123");
    }
    if (eg) {
        ValResult r = validatePhone("0101234567", *eg);
        rep.check(!r.ok && r.reason == "short", "reject 9-digit EG national number");
    }
    if (eg) {
        ValResult r = validatePhone("1301234567", *eg);
        rep.check(!r.ok && r.reason == "pattern", "reject EG number failing the pattern");
    }
    if (eg) {
        ValResult r = validatePhone("12345678901234567890", *eg);
        rep.check(!r.ok && r.reason == "long", "reject too-long EG number");
    }
    if (sa) {
        ValResult r = validatePhone("01012345678", *sa);
        rep.check(!r.ok, "reject Egyptian number when validating as Saudi");
    }

    /* -------------------- 3. detection + generic E.164 ---------- */
    {
        const Country* det = nullptr;
        std::string e164;
        bool okDet = detectCountry("+966512345678", det, e164);
        rep.check(okDet && det && det->c == "SA",
                  "detect SA from +966512345678");
    }
    {
        const Country* det = nullptr;
        std::string e164;
        bool okDet = detectCountry("+201012345678", det, e164);
        rep.check(okDet && det && det->c == "EG",
                  "detect EG from +201012345678");
    }
    {
        const Country* det = nullptr;
        std::string e164;
        bool okDet = detectCountry("1", det, e164);
        rep.check(!okDet, "detect() rejects a single digit");
    }
    {
        GenericResult g = validateGeneric("+998901234567");
        rep.check(g.ok && g.e164 == "+998901234567",
                  "generic E.164 accepts a country outside the table");
    }
    {
        GenericResult g = validateGeneric("12345");
        rep.check(!g.ok && g.reason == "short", "generic E.164 rejects < 6 digits");
    }

    /* -------------------- 4. country table integrity ------------ */
    {
        const std::vector<Country>& l = countryTable();
        rep.check(l.size() >= 58, "country table has at least 58 countries");
    }
    {
        int bad = 0;
        std::string badCode;
        const std::vector<Country>& l = countryTable();
        for (size_t i = 0; i < l.size(); ++i) {
            ValResult r = validatePhone(l[i].ex, l[i]);
            if (!r.ok) {
                ++bad;
                if (badCode.empty()) badCode = l[i].c;
            }
        }
        rep.check(bad == 0, "every country example validates (bad=" + std::to_string(bad) +
                            (badCode.empty() ? std::string() : (" first=" + badCode)) + ")");
    }

    /* -------------------- 5. playerId rules ---------------------- */
    {
        std::vector<FieldError> e;
        App::validatePlayerIdField("5123456789", e);
        rep.check(e.empty(), "playerId 5123456789 accepted (8..12 digits)");
    }
    {
        std::vector<FieldError> e;
        App::validatePlayerIdField("512", e);
        rep.check(e.size() == 1 && e[0].code == "invalid_length" && e[0].field == "playerId",
                  "playerId 512 rejected with invalid_length");
    }
    {
        std::vector<FieldError> e;
        App::validatePlayerIdField("51ab34", e);
        rep.check(!e.empty(), "playerId with letters rejected");
    }

    /* -------------------- 6. full lifecycle + idempotency ------- */
    Config cfg = configFromEnv();
    cfg.fastMode = true;
    cfg.forceSuccess = true;
    cfg.ordersFile = "selftest_orders.jsonl";

    {
        Engine engine(cfg);
        engine.start();

        Job j;
        j.orderId   = "SHN-SELFTEST-0001";
        j.game      = "pubg";
        j.packageId = "uc660";
        j.packageLabel = "660 شدة";
        j.playerId  = "5123456789";
        j.region    = "EG";
        j.amount    = 220;
        j.currency  = "EGP";
        j.payMethod = "card";
        j.payRef    = "PAY-TEST-1";
        j.payStatus = "paid";
        j.custPhone = "+201012345678";
        j.idemKey   = "SHN-SELFTEST-0001";

        SubmitResult res;
        bool submitted = engine.submit(j, res);
        rep.check(submitted && res.ok && !res.duplicate &&
                  res.status == "queued" && res.attempts == 0,
                  "POST /topup equivalent -> 202 queued / attempts 0 / duplicate false");

        bool terminal = engine.waitUntilTerminal(res.jobId, 20000);
        Job got;
        bool found = engine.getJob(res.jobId, got);
        rep.check(terminal && found && got.status == "delivered",
                  "order lifecycle reaches delivered");
        rep.check(got.attempts >= 1, "delivered order reports attempts >= 1");
        rep.check(startsWith(got.providerRef, "PRV-"),
                  "delivered order has a providerRef");

        bool hasQueued = false, hasProcessing = false, hasDelivered = false;
        for (size_t i = 0; i < got.timeline.size(); ++i) {
            if (got.timeline[i].status == "queued")     hasQueued = true;
            if (got.timeline[i].status == "processing") hasProcessing = true;
            if (got.timeline[i].status == "delivered")  hasDelivered = true;
        }
        rep.check(hasQueued && hasProcessing && hasDelivered,
                  "timeline records queued -> processing -> delivered");

        /* duplicate via idempotencyKey */
        SubmitResult dup;
        bool submitted2 = engine.submit(j, dup);
        rep.check(submitted2 && dup.duplicate && dup.jobId == res.jobId,
                  "same idempotencyKey returns the same jobId with duplicate=true");

        /* unknown job */
        Job nope;
        rep.check(!engine.getJob("JOB-000000-9999", nope), "unknown jobId is not found");

        long long total = 0, qd = 0, pr = 0, dl = 0, fl = 0;
        engine.counts(total, qd, pr, dl, fl);
        rep.check(total >= 1 && dl >= 1, "health counters include the delivered job");

        engine.stop();
    }

    /* -------------------- 7. retry + failure path --------------- */
    {
        Config cfg2 = cfg;
        cfg2.forceSuccess = false;
        cfg2.forceFail = true;
        cfg2.maxAttempts = 3;

        Engine engine2(cfg2);
        engine2.start();

        Job j;
        j.orderId = "SHN-SELFTEST-0002";
        j.game = "pubg";
        j.playerId = "5123456789";
        j.region = "EG";
        j.idemKey = "SHN-SELFTEST-0002";

        SubmitResult res;
        engine2.submit(j, res);
        bool terminal = engine2.waitUntilTerminal(res.jobId, 20000);
        Job got;
        engine2.getJob(res.jobId, got);

        rep.check(terminal && got.status == "failed",
                  "all attempts exhausted -> failed");
        rep.check(got.attempts == 3, "failed order used exactly 3 attempts (MAX_ATTEMPTS)");
        bool sawRetry = false;
        for (size_t i = 0; i < got.timeline.size(); ++i) {
            if (got.timeline[i].status == "retrying") sawRetry = true;
        }
        rep.check(sawRetry, "timeline records a retrying step before giving up");

        engine2.stop();
    }

    /* -------------------- 8. backoff schedule ------------------- */
    {
        Config c3 = cfg;
        c3.providerMode = "live";
        Engine e3(c3);
        rep.check(e3.backoffSecondsForTest(1) == 2 &&
                  e3.backoffSecondsForTest(2) == 4 &&
                  e3.backoffSecondsForTest(3) == 8,
                  "live backoff is 2s -> 4s -> 8s");
        Config c4 = cfg;
        c4.providerMode = "demo";
        Engine e4(c4);
        rep.check(e4.backoffSecondsForTest(1) == 1 &&
                  e4.backoffSecondsForTest(2) == 2 &&
                  e4.backoffSecondsForTest(3) == 3,
                  "demo backoff is 1s -> 2s -> 3s");
    }

    std::cout << "-------------------------------------------\n";
    std::cout << "total=" << (passed + failed) << "  passed=" << passed
              << "  failed=" << failed << "\n";
    std::cout << (failed == 0 ? "RESULT: ALL PASS\n" : "RESULT: FAILURES\n");
    return failed == 0 ? 0 : 1;
}

}  // namespace shn

/* ===========================================================================
   15) main
   ========================================================================= */

static void printUsage(const char* argv0) {
    std::cout << "shahnly top-up service (C++17)\n\n";
    std::cout << "Usage:\n";
    std::cout << "  " << argv0 << " [--port N]     start the HTTP server (default port 8788)\n";
    std::cout << "  " << argv0 << " --selftest     run offline self tests (PASS/FAIL)\n";
    std::cout << "  " << argv0 << " --help\n\n";
    std::cout << "Environment:\n";
    std::cout << "  PORT                 default 8788\n";
    std::cout << "  PROVIDER_MODE        demo | live            (default demo)\n";
    std::cout << "  PROVIDER_URL         live provider endpoint (default empty)\n";
    std::cout << "  PROVIDER_KEY         HMAC-SHA256 key for X-Signature\n";
    std::cout << "  DEMO_FAILURE_RATE    default 0.05\n";
    std::cout << "  MAX_ATTEMPTS         default 3\n";
    std::cout << "  ORDERS_FILE          default orders.jsonl\n";
}

int main(int argc, char** argv) {
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "[error] WSAStartup failed\n";
        return 1;
    }
#endif

    shn::Config cfg = shn::configFromEnv();

    bool selftest = false;
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--selftest") {
            selftest = true;
        } else if (a == "--help" || a == "-h") {
            printUsage(argv[0]);
#ifdef _WIN32
            WSACleanup();
#endif
            return 0;
        } else if (a == "--port" && i + 1 < argc) {
            try {
                cfg.port = std::stoi(argv[++i]);
            } catch (...) {
            }
        } else if (shn::startsWith(a, "--port=")) {
            try {
                cfg.port = std::stoi(a.substr(7));
            } catch (...) {
            }
        }
    }

    int rc;
    if (selftest) {
        rc = shn::runSelftest();
    } else {
        rc = shn::runServer(cfg);
    }

#ifdef _WIN32
    WSACleanup();
#endif
    return rc;
}
