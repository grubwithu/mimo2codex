import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";

import "./i18n";
import "antd/dist/reset.css";
import "highlight.js/styles/github.css";
import "./styles.css";

import App from "./App";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";

function ThemedApp() {
  const { lang } = useLanguage();
  return (
    <ConfigProvider
      locale={lang === "zh" ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        cssVar: true,
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ThemedApp />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
