import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DOC_GROUP_ORDER, groupedDocs } from "../docs/catalog";
import { useLanguage } from "../contexts/LanguageContext";

export default function DocSidebar() {
  const { lang } = useLanguage();
  const { t } = useTranslation("docs");
  const groups = groupedDocs();

  return (
    <aside className="docs-sidebar">
      {DOC_GROUP_ORDER.map((group) => (
        <div className="group" key={group}>
          <div className="group-title">{t(`groups.${group}`)}</div>
          {groups[group].map((doc) => (
            <NavLink
              key={doc.slug}
              to={`/docs/${doc.slug}`}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {doc.title[lang]}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  );
}
