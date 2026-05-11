import React from "react";
import { createRoot } from "react-dom/client";
import { IntlProvider } from "react-intl";
import { App } from "./src/app/App";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <IntlProvider locale="en" defaultLocale="en">
      <App />
    </IntlProvider>
  );
}
