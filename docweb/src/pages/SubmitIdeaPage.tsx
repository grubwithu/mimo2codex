import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Result,
  Row,
  Space,
  Typography,
} from "antd";
import { ArrowLeftOutlined, BulbOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { ApiError, submitIdea } from "../api/client";
import { useLanguage } from "../contexts/LanguageContext";
import MilkdownField from "../components/MilkdownField";

interface FormShape {
  title: string;
  body: string;
  background?: string;
  contact?: string;
}

// SubmitIdeaPage is the dedicated submission surface — v4 of the flow moved
// off the cramped modal so the markdown editor has room to breathe. Layout
// mirrors IdeaDetailPage: a centered ~880px column with a back link, hero
// header, and a single card holding the full form.
export default function SubmitIdeaPage() {
  const { t } = useTranslation("ideas");
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [form] = Form.useForm<FormShape>();
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(values: FormShape) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitIdea({
        title: values.title.trim(),
        body: values.body.trim(),
        background: values.background?.trim() || undefined,
        contact: values.contact?.trim() || undefined,
        lang,
      });
      setSubmittedId(res.id);
      form.resetFields();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setSubmitError(t("form.errors.rate"));
      } else if (err instanceof ApiError && err.status === 400) {
        setSubmitError(t("form.errors.validation"));
      } else {
        setSubmitError(t("form.errors.unknown"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "32px 24px 80px", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/ideas">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
            {t("detail.back")}
          </Button>
        </Link>
      </div>

      {/* Hero */}
      <Card
        variant="borderless"
        styles={{
          body: {
            background: "linear-gradient(135deg, #fff7e6 0%, #e6f4ff 100%)",
            borderRadius: 12,
            padding: 24,
          },
        }}
        style={{ marginBottom: 24 }}
      >
        <Space align="start" size={14}>
          <BulbOutlined style={{ fontSize: 28, color: "#faad14", marginTop: 4 }} />
          <div>
            <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
              {t("modal.title")}
            </Typography.Title>
            <Typography.Text type="secondary">{t("page.subtitle")}</Typography.Text>
          </div>
        </Space>
      </Card>

      {submittedId !== null ? (
        <Card>
          <Result
            status="success"
            title={t("form.submittedTitle")}
            subTitle={t("form.submittedDesc")}
            extra={
              <Space>
                <Button
                  type="primary"
                  onClick={() => {
                    setSubmittedId(null);
                    setSubmitError(null);
                    form.resetFields();
                  }}
                >
                  {t("page.openSubmit")}
                </Button>
                <Button onClick={() => navigate("/ideas")}>
                  {t("detail.back")}
                </Button>
              </Space>
            }
          />
        </Card>
      ) : (
        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            requiredMark={false}
            size="middle"
          >
            <Form.Item
              label={t("form.title")}
              name="title"
              rules={[{ required: true, message: t("form.errors.validation") }]}
            >
              <Input
                maxLength={200}
                placeholder={t("form.titlePlaceholder")}
                size="large"
              />
            </Form.Item>

            <Form.Item
              label={
                <span>
                  {t("form.body")}{" "}
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 12, fontWeight: "normal" }}
                  >
                    · {t("modal.bodyHint")}
                  </Typography.Text>
                </span>
              }
              name="body"
              rules={[
                { required: true, message: t("form.errors.validation") },
                {
                  validator(_, value: string | undefined) {
                    if (value && value.length > 4000) {
                      return Promise.reject(new Error(t("form.errors.validation")));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              valuePropName="value"
              getValueFromEvent={(val) => (typeof val === "string" ? val : "")}
            >
              {/* Page layout gives the editor real estate — minHeight 480
                  fits a typical paragraph plus code/example without scrolling,
                  which is what we couldn't do inside the cramped modal. */}
              <MilkdownField
                placeholder={t("form.bodyPlaceholder")}
                minHeight={480}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item label={t("form.background")} name="background">
                  <Input
                    maxLength={500}
                    placeholder={t("form.backgroundPlaceholder")}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={t("form.contact")} name="contact">
                  <Input
                    maxLength={200}
                    placeholder={t("form.contactPlaceholder")}
                  />
                </Form.Item>
              </Col>
            </Row>

            {submitError && (
              <Alert
                type="error"
                showIcon
                message={submitError}
                style={{ marginBottom: 16 }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                paddingTop: 8,
                borderTop: "1px solid #f0f0f0",
                marginTop: 8,
              }}
            >
              <Button
                onClick={() => navigate("/ideas")}
                disabled={submitting}
              >
                {t("modal.cancel")}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                size="large"
              >
                {submitting ? t("form.submitting") : t("form.submit")}
              </Button>
            </div>
          </Form>
        </Card>
      )}
    </div>
  );
}
