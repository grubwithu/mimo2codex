import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const GITHUB_URL = "https://github.com/7as0nch/mimo2codex";
const ISSUES_URL = "https://github.com/7as0nch/mimo2codex/issues";
const NPM_URL = "https://www.npmjs.com/package/mimo2codex";

export default function Footer() {
  const { t } = useTranslation("common");
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div>
          <strong>mimo2codex</strong> · MIT License · © {year} · {t("footer.tagline")}
        </div>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            {t("footer.links.github")}
          </a>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            {t("footer.links.issues")}
          </a>
          <Link to="/docs">{t("footer.links.docs")}</Link>
          <Link to="/ideas">{t("nav.ideas")}</Link>
          <a href={NPM_URL} target="_blank" rel="noreferrer">
            {t("footer.links.npm")}
          </a>
        </div>
        <div>{t("footer.builtWith")}</div>
      </div>
    </footer>
  );
}
