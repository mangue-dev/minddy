"use client";

import * as React from "react";
import { NextIntlClientProvider, useLocale } from "next-intl";

type IntlProviderProps = React.ComponentProps<typeof NextIntlClientProvider>;

/**
 * Keep the server and hydration render stable, then switch date formatting to
 * the browser's actual time zone. The server normally runs in UTC, which is
 * not the wall clock used by date/time inputs on the user's device.
 */
export function BrowserIntlProvider({
  initialTimeZone,
  ...props
}: IntlProviderProps & { initialTimeZone: string }) {
  const [timeZone, setTimeZone] = React.useState(initialTimeZone);

  React.useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone && browserTimeZone !== timeZone) {
      setTimeZone(browserTimeZone);
    }
  }, [timeZone]);

  return <NextIntlClientProvider {...props} timeZone={timeZone} />;
}

/** Replace only the message catalog while inheriting locale, clock and zone. */
export function InheritedIntlProvider(props: IntlProviderProps) {
  const inheritedLocale = useLocale();
  const { locale, ...rest } = props;
  return (
    <NextIntlClientProvider locale={locale ?? inheritedLocale} {...rest} />
  );
}
