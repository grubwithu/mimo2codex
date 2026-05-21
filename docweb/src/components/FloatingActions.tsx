import { useEffect, useState } from "react";
import { FloatButton, Popover, Typography } from "antd";
import {
  BulbOutlined,
  EditOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AskDrawer from "./AskDrawer";

// Attention popovers re-open on every page refresh (= every fresh mount of
// FloatingActions). We deliberately do NOT persist a "seen" flag — the user
// said "every refresh should pop it" so the bubbles are nudges, not one-time
// onboarding. They still auto-close after a few seconds so they don't linger.
const AI_ATTENTION_MS = 6000;
const SUBMIT_ATTENTION_MS = 8000;

// FloatingActions hosts the persistent right-bottom floats:
//   - submit (✏️): visible on /ideas and /ideas/:id, navigates to /ideas/new.
//     Hidden on /ideas/new itself (already there).
//   - lightbulb (💡): hidden on /ideas* (it just routes there); shown
//     elsewhere as the entry point into the ideas board.
//   - robot (🤖): the AI assistant drawer; always visible.
export default function FloatingActions() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [askOpen, setAskOpen] = useState(false);

  const onIdeasArea = location.pathname.startsWith("/ideas");
  const onSubmitPage = location.pathname === "/ideas/new";
  const showSubmitFloat = onIdeasArea && !onSubmitPage;

  // Both popovers initialize to OPEN on mount, then auto-close via a timer.
  // useState(true) covers the React-refresh + StrictMode edge case where
  // setting state inside useEffect didn't propagate; lazy init for the
  // submit popover keys off the route so a deep-link to a non-ideas page
  // starts closed.
  const [submitAttention, setSubmitAttention] = useState(() => showSubmitFloat);
  const [askAttention, setAskAttention] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setAskAttention(false), AI_ATTENTION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSubmitFloat) {
      setSubmitAttention(false);
      return;
    }
    setSubmitAttention(true);
    const timer = window.setTimeout(
      () => setSubmitAttention(false),
      SUBMIT_ATTENTION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [showSubmitFloat]);

  const submitFloat = showSubmitFloat ? (
    <Popover
      open={submitAttention}
      placement="left"
      content={
        <div style={{ maxWidth: 220 }}>
          <Typography.Text strong>
            {t("ideas:floats.submitAttentionTitle")}
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("ideas:floats.submitAttentionDesc")}
            </Typography.Text>
          </div>
        </div>
      }
      zIndex={1000}
    >
      <FloatButton
        type="primary"
        icon={<EditOutlined />}
        tooltip={t("ideas:floats.submitTooltip")}
        badge={submitAttention ? { dot: true, color: "red" } : undefined}
        onClick={() => {
          setSubmitAttention(false);
          navigate("/ideas/new");
        }}
      />
    </Popover>
  ) : null;

  const askFloat = (
    <Popover
      open={askAttention}
      placement="left"
      content={
        <div style={{ maxWidth: 240 }}>
          <Typography.Text strong>
            {t("ideas:floats.askAttentionTitle")}
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t("ideas:floats.askAttentionDesc")}
            </Typography.Text>
          </div>
        </div>
      }
      zIndex={1000}
    >
      <FloatButton
        type={onIdeasArea ? "default" : "primary"}
        icon={<RobotOutlined />}
        tooltip={t("common:floats.askTooltip")}
        badge={askAttention ? { dot: true, color: "red" } : undefined}
        onClick={() => {
          setAskAttention(false);
          setAskOpen(true);
        }}
      />
    </Popover>
  );

  return (
    <>
      <FloatButton.Group shape="circle" style={{ right: 24, bottom: 24 }}>
        {submitFloat}
        {!onIdeasArea && (
          <FloatButton
            type="default"
            icon={<BulbOutlined style={{ color: "#faad14" }} />}
            tooltip={t("common:floats.ideaTooltip")}
            onClick={() => navigate("/ideas")}
          />
        )}
        {askFloat}
      </FloatButton.Group>
      <AskDrawer open={askOpen} onClose={() => setAskOpen(false)} />
    </>
  );
}
