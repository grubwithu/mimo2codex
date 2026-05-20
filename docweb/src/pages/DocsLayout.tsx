import { Outlet, useParams } from "react-router-dom";
import DocSidebar from "../components/DocSidebar";

export default function DocsLayout() {
  const { slug } = useParams();
  // On the docs index (/docs without slug) hide the sidebar and let the home grid breathe.
  if (!slug) {
    return <Outlet />;
  }
  return (
    <div className="docs-layout">
      <DocSidebar />
      <Outlet />
    </div>
  );
}
