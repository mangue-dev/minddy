#include <chrono>
#include <exception>
#include <iostream>
#include <string>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Services.Store.h>

using namespace winrt;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Services::Store;

namespace {

int write_error(std::wstring const& message) {
  std::wcerr << message << L'\n';
  return 1;
}

}  // namespace

int wmain() {
  try {
    init_apartment(apartment_type::multi_threaded);
    auto operation =
        StoreContext::GetDefault().GetAppAndOptionalStorePackageUpdatesAsync();
    if (operation.wait_for(std::chrono::minutes(1)) != AsyncStatus::Completed) {
      operation.Cancel();
      return write_error(L"Microsoft Store update detection timed out.");
    }
    auto const updates = operation.GetResults();
    std::cout << "{\"available\":"
              << (updates.Size() > 0 ? "true" : "false") << "}\n";
    return 0;
  } catch (hresult_error const& error) {
    return write_error(error.message().c_str());
  } catch (std::exception const& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
