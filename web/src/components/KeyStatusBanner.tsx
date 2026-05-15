import { Alert } from "antd";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../api/client";

interface Props {
  providers: ProviderInfo[];
}

export function KeyStatusBanner({ providers }: Props) {
  const { t } = useTranslation("keyBanner");
  const missing = providers.filter((p) => !p.api_key_present);

  if (missing.length === 0) {
    return <Alert type="success" showIcon message={t("allOk")} />;
  }

  const firstEnv = missing[0].api_key_env[0];
  return (
    <Alert
      type="warning"
      showIcon
      message={
        <>
          <strong>{t("missingTitle")}</strong>{" "}
          {missing.map((p) => p.display_name).join(", ")}
        </>
      }
      description={
        <>
          <div>{t("missingHint")}</div>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
            {missing.map((p) => (
              <li key={p.id}>
                {p.display_name}: <code>{p.api_key_env.join(" / ")}</code>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {t("exampleLabel")}
            <br />
            {t("macLinux")}: <code>export {firstEnv}=sk-xxxxxx</code>
            <br />
            {t("windows")}: <code>$env:{firstEnv}="sk-xxxxxx"</code>
          </div>
        </>
      }
    />
  );
}
