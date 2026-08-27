#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>

#include <winrt/Microsoft.Windows.AppLifecycle.h>
#include <winrt/Microsoft.Windows.PushNotifications.h>
#include <winrt/Windows.Data.Xml.Dom.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.Notifications.h>

using namespace winrt;
using namespace winrt::Microsoft::Windows::AppLifecycle;
using namespace winrt::Microsoft::Windows::PushNotifications;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::UI::Notifications;

namespace {

int write_error(std::wstring const& message) {
  std::wcerr << message << L'\n';
  return 1;
}

void handle_push_activation() {
  auto const activated = AppInstance::GetCurrent().GetActivatedEventArgs();
  if (activated.Kind() != ExtendedActivationKind::Push) return;
  auto const push = activated.Data().as<PushNotificationReceivedEventArgs>();
  auto const deferral = push.GetDeferral();
  deferral.Complete();
}

int request_channel() {
  guid const remote_id{MINDDY_WNS_OBJECT_ID};
  auto operation = PushNotificationManager::Default().CreateChannelAsync(remote_id);
  if (operation.wait_for(std::chrono::minutes(5)) != AsyncStatus::Completed) {
    operation.Cancel();
    return write_error(L"WNS channel acquisition timed out.");
  }
  auto const result = operation.GetResults();
  if (result.Status() != PushNotificationChannelStatus::CompletedSuccess) {
    return write_error(L"WNS rejected channel acquisition.");
  }
  std::cout << "{\"channelUri\":\""
            << to_string(result.Channel().Uri().ToString())
            << "\"}\n";
  return 0;
}

int update_badge(int count) {
  auto const value = count > 0 ? std::to_wstring(count) : L"none";
  Windows::Data::Xml::Dom::XmlDocument xml;
  xml.LoadXml(L"<badge value=\"" + value + L"\"/>");
  BadgeUpdateManager::CreateBadgeUpdaterForApplication().Update(BadgeNotification(xml));
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  try {
    init_apartment(apartment_type::multi_threaded);
    if (!PushNotificationManager::IsSupported()) {
      return write_error(L"Windows App SDK push notifications are unavailable.");
    }

    auto const manager = PushNotificationManager::Default();
    auto const received = manager.PushReceived(
        [](auto const&, PushNotificationReceivedEventArgs const&) {});
    manager.Register();

    if (argc > 1 && std::wstring_view(argv[1]) == L"channel") {
      return request_channel();
    }
    if (argc > 2 && std::wstring_view(argv[1]) == L"badge") {
      return update_badge(std::max(0, _wtoi(argv[2])));
    }
    if (argc > 1 && std::wstring_view(argv[1]) == L"unregister") {
      manager.Unregister();
      return 0;
    }

    handle_push_activation();
    manager.PushReceived(received);
    return 0;
  } catch (hresult_error const& error) {
    return write_error(error.message().c_str());
  } catch (std::exception const& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
