import { Segmented } from "antd";
import { useLanguage } from "../contexts/LanguageContext";

export default function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  return (
    <Segmented
      size="small"
      value={lang}
      onChange={(v) => setLang(v as "en" | "zh")}
      options={[
        { label: "中文", value: "zh" },
        { label: "EN", value: "en" },
      ]}
    />
  );
}
