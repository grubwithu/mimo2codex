import { Link } from "react-router-dom";
import { Button, Result } from "antd";

export default function NotFound() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Page not found / 页面不存在"
      extra={
        <Link to="/">
          <Button type="primary">Back home / 返回首页</Button>
        </Link>
      }
      style={{ padding: "64px 24px" }}
    />
  );
}
