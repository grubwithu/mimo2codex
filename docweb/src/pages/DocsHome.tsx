import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DOC_GROUP_ORDER, groupedDocs } from "../docs/catalog";
import { useLanguage } from "../contexts/LanguageContext";

export default function DocsHome() {
  const { lang } = useLanguage();
  const { t } = useTranslation("docs");
  const groups = groupedDocs();

  return (
    <>
      <section className="section" style={{ paddingBottom: 24 }}>
        <div className="section-inner">
          <div className="section-head">
            <h2>{t("home.title")}</h2>
            <p>{t("home.subtitle")}</p>
          </div>
        </div>
      </section>
      {DOC_GROUP_ORDER.map((group) => {
        const list = groups[group];
        if (list.length === 0) return null;
        return (
          <section
            key={group}
            style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 32px" }}
          >
            <h3 style={{ marginBottom: 14, fontSize: 18 }}>
              {t(`groups.${group}`)}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {list.map((doc) => (
                <Link
                  to={`/docs/${doc.slug}`}
                  key={doc.slug}
                  className="doc-card"
                >
                  <span className="group-tag">{t(`groups.${group}`)}</span>
                  <h3>{doc.title[lang]}</h3>
                  <p>{doc.summary[lang]}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <div style={{ height: 48 }} />
    </>
  );
}
