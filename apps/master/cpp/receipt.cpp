// Thermal ESC/POS receipt printer for the Cafe restaurant app.
// Target: Windows, 80mm thermal printer. Prints RAW ESC/POS via Win32.
//
// Build (MSVC):
//   cl /EHsc /std:c++17 receipt.cpp /link winspool.lib
// Build (MinGW on Windows):
//   g++ -std=c++17 -O2 receipt.cpp -o receipt.exe -lwinspool
// Cross-compile from Linux (MinGW-w64):
//   x86_64-w64-mingw32-g++ -std=c++17 -O2 -static -static-libgcc -static-libstdc++ \
//     receipt.cpp -o receipt.exe -lwinspool
//
// Invocation (7 positional args, all UTF-8):
//   receipt.exe <printer> <heading> <orderInfo> <items> <subtotal> <discount> <total>
// where:
//   <printer>    Windows printer name (e.g. "POS-80")
//   <heading>    store heading line
//   <orderInfo>  newline-separated info lines (Buyurtma #N, Stol: N, Tur: ..., Sana: ...)
//   <items>      ";"-separated items. Each item is "name|qty|unit|total"
//   <subtotal>   "Jami" amount
//   <discount>   "Chegirma" amount
//   <total>      "Umumiy" amount

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winspool.h>

#include <shellapi.h>

#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace {

const unsigned char ESC = 0x1B;
const unsigned char GS = 0x1D;
const int RECEIPT_WIDTH = 48;

std::string byte(unsigned char value) {
    return std::string(1, static_cast<char>(value));
}

std::string escInit()        { return byte(ESC) + "@"; }
// Select PC437 code page (n=0). Forces a Latin code table so multi-byte
// stragglers don't get reinterpreted as CJK on printers shipped with
// GB18030/GBK as the default. Pair with ESC R 0 (USA character set).
std::string selectCodePageLatin() { return byte(ESC) + "t" + byte(0); }
std::string selectCharsetUSA()    { return byte(ESC) + "R" + byte(0); }
std::string alignLeft()      { return byte(ESC) + "a" + byte(0); }
std::string alignCenter()    { return byte(ESC) + "a" + byte(1); }
std::string alignRight()     { return byte(ESC) + "a" + byte(2); }
std::string boldOn()         { return byte(ESC) + "E" + byte(1); }
std::string boldOff()        { return byte(ESC) + "E" + byte(0); }
std::string sizeDouble()     { return byte(GS) + "!" + byte(0x11); }
std::string sizeNormal()     { return byte(GS) + "!" + byte(0x00); }
std::string feed(int n)      { return byte(ESC) + "d" + byte(static_cast<unsigned char>(n)); }
std::string cutPartial()     { return byte(GS) + "V" + byte(0x41) + byte(0x03); }

std::vector<std::string> split(const std::string& input, char delim) {
    std::vector<std::string> out;
    std::string token;
    for (char ch : input) {
        if (ch == delim) {
            out.push_back(token);
            token.clear();
        } else {
            token.push_back(ch);
        }
    }
    out.push_back(token);
    return out;
}

std::string repeat(char ch, int count) {
    if (count < 0) count = 0;
    return std::string(count, ch);
}

std::string twoColumns(const std::string& left, const std::string& right, int width) {
    int spaces = width - static_cast<int>(left.size()) - static_cast<int>(right.size());
    if (spaces < 1) spaces = 1;
    return left + std::string(spaces, ' ') + right;
}

std::string wrap(const std::string& text, int width) {
    if (static_cast<int>(text.size()) <= width) {
        return text;
    }

    std::string out;
    int start = 0;
    const int n = static_cast<int>(text.size());
    while (start < n) {
      const int len = std::min(width, n - start);
      out.append(text, start, len);
      out.push_back('\n');
      start += len;
    }
    if (!out.empty() && out.back() == '\n') {
        out.pop_back();
    }
    return out;
}

std::wstring utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    const int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    if (len <= 0) return L"";
    std::wstring result(static_cast<size_t>(len - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &result[0], len);
    return result;
}

std::string wideToUtf8(const std::wstring& s) {
    if (s.empty()) return "";
    const int len = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (len <= 0) return "";
    std::string result(static_cast<size_t>(len - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), -1, &result[0], len, nullptr, nullptr);
    return result;
}

std::string windowsErrorMessage(DWORD errorCode) {
    LPWSTR buffer = nullptr;

    const DWORD length = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,
        errorCode,
        MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
        reinterpret_cast<LPWSTR>(&buffer),
        0,
        nullptr
    );

    if (length == 0 || buffer == nullptr) {
        return "Unknown Windows error";
    }

    std::wstring message(buffer, length);
    LocalFree(buffer);

    while (!message.empty() && (message.back() == L'\r' || message.back() == L'\n' || message.back() == L' ')) {
        message.pop_back();
    }

    return wideToUtf8(message);
}

void writePrinterError(const std::string& apiName, DWORD errorCode) {
    std::cerr
        << apiName
        << " failed. GetLastError=" << errorCode
        << " message=\"" << windowsErrorMessage(errorCode) << "\"\n";
}

bool sendToPrinter(const std::wstring& printerName, const std::string& payload) {
    HANDLE hPrinter = nullptr;
    if (!OpenPrinterW(const_cast<LPWSTR>(printerName.c_str()), &hPrinter, nullptr)) {
        writePrinterError("OpenPrinterW", GetLastError());
        return false;
    }

    DOC_INFO_1W docInfo{};
    docInfo.pDocName = const_cast<LPWSTR>(L"Cafe Receipt");
    docInfo.pOutputFile = nullptr;
    docInfo.pDatatype = const_cast<LPWSTR>(L"RAW");

    const DWORD jobId = StartDocPrinterW(hPrinter, 1, reinterpret_cast<LPBYTE>(&docInfo));
    if (jobId == 0) {
        writePrinterError("StartDocPrinterW", GetLastError());
        ClosePrinter(hPrinter);
        return false;
    }

    bool ok = true;
    bool pageStarted = false;

    if (!StartPagePrinter(hPrinter)) {
        writePrinterError("StartPagePrinter", GetLastError());
        ok = false;
    } else {
        pageStarted = true;
        DWORD written = 0;
        const BOOL writeOk = WritePrinter(
            hPrinter,
            const_cast<LPVOID>(reinterpret_cast<LPCVOID>(payload.data())),
            static_cast<DWORD>(payload.size()),
            &written);
        if (!writeOk || written != payload.size()) {
            if (!writeOk) {
                writePrinterError("WritePrinter", GetLastError());
            } else {
                std::cerr
                    << "WritePrinter failed. Partial write detected. written="
                    << written
                    << " expected=" << payload.size() << "\n";
            }
            ok = false;
        }
    }

    if (pageStarted) {
        if (!EndPagePrinter(hPrinter)) {
            writePrinterError("EndPagePrinter", GetLastError());
            ok = false;
        }
    }

    if (!EndDocPrinter(hPrinter)) {
        writePrinterError("EndDocPrinter", GetLastError());
        ok = false;
    }

    ClosePrinter(hPrinter);
    return ok;
}

std::vector<std::string> readArgsUtf8() {
    std::vector<std::string> out;
    int argc = 0;
    LPWSTR* argvW = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argvW) return out;

    for (int i = 0; i < argc; ++i) {
        out.push_back(wideToUtf8(argvW[i]));
    }
    LocalFree(argvW);
    return out;
}

}  // namespace

int main() {
    const std::vector<std::string> argv = readArgsUtf8();

    if (argv.size() < 8) {
        std::cerr << "Usage: receipt <printer> <heading> <orderInfo> <items> <subtotal> <discount> <total>\n";
        return 1;
    }

    const std::string printerNameUtf8 = argv[1];
    const std::string heading = argv[2];
    const std::string orderInfo = argv[3];
    const std::string itemsData = argv[4];
    const std::string subtotal = argv[5];
    const std::string discount = argv[6];
    const std::string totalAmount = argv[7];

    const std::wstring printerName = utf8ToWide(printerNameUtf8);

    if (printerNameUtf8.empty() || printerName.empty()) {
        std::cerr << "Printer name is empty or invalid\n";
        return 1;
    }

    std::string payload;
    payload.reserve(1024);

    payload += escInit();
    payload += selectCodePageLatin();
    payload += selectCharsetUSA();

    payload += alignCenter();
    payload += boldOn();
    payload += sizeDouble();
    payload += heading + "\n";
    payload += sizeNormal();
    payload += boldOff();
    payload += "\n";

    payload += alignLeft();
    {
        const auto infoLines = split(orderInfo, '\n');
        for (const auto& line : infoLines) {
            if (line.empty()) continue;
            payload += wrap(line, RECEIPT_WIDTH) + "\n";
        }
    }
    payload += repeat('-', RECEIPT_WIDTH) + "\n";

    {
        const auto items = split(itemsData, ';');
        for (const auto& entry : items) {
            if (entry.empty()) continue;
            const auto parts = split(entry, '|');
            if (parts.size() < 4) continue;

            const std::string& name = parts[0];
            const std::string& qty = parts[1];
            const std::string& unit = parts[2];
            const std::string& total = parts[3];

            payload += wrap(name, RECEIPT_WIDTH) + "\n";

            std::ostringstream left;
            left << "  " << qty << " x " << unit;
            payload += twoColumns(left.str(), total, RECEIPT_WIDTH) + "\n";
        }
    }

    payload += repeat('-', RECEIPT_WIDTH) + "\n";

    payload += twoColumns("Jami:", subtotal, RECEIPT_WIDTH) + "\n";
    payload += twoColumns("Chegirma:", discount, RECEIPT_WIDTH) + "\n";
    payload += boldOn();
    payload += twoColumns("Umumiy:", totalAmount, RECEIPT_WIDTH) + "\n";
    payload += boldOff();
    payload += "\n";

    payload += alignCenter();
    payload += "Xaridingiz uchun rahmat!\n";
    payload += "Yana tashrif buyuring\n";
    payload += alignLeft();

    payload += feed(3);
    payload += cutPartial();

    if (!sendToPrinter(printerName, payload)) {
        std::cerr << "Printer write failed\n";
        return 2;
    }

    return 0;
}
