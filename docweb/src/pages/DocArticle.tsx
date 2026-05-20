import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Empty } from "antd";
import { useTranslation } from "react-i18next";
import { loadDoc } from "../docs/loader";
import { findDoc } from "../docs/catalog";
import { useLanguage } from "../contexts/LanguageContext";
import MarkdownView from "../components/MarkdownView";
import DocToc from "../components/DocToc";

export default function DocArticle() {
  const { slug = "" } = useParams();
  const { lang } = useLanguage();
  const { t } = useTranslation("docs");

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  const result = loadDoc(slug, lang);
  const meta = findDoc(slug);

  if (!result) {
    return (
      <main style={{ padding: "48px 0" }}>
        <Empty description={t("missing")} />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/docs">{t("backToList")}</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <main>
        {meta && (
          <div style={{ marginBottom: 8, color: "var(--ink-soft)", fontSize: 13 }}>
            <Link to="/docs">{t("backToList")}</Link>
          </div>
        )}
        {result.fellBack && (
          <Alert
            type="info"
            showIcon
            message={t("fallbackNotice")}
            style={{ marginBottom: 18 }}
          />
        )}
        <MarkdownView content={result.content} />
      </main>
      <DocToc content={result.content} />
    </>
  );
}
