"use client";

import { useState, useEffect } from "react";
import { Header } from "@/shared/components/layout";
import { PageContainer } from "@/shared/components/layout";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useAuth } from "@/modules/auth/use-auth";
import { Check } from "lucide-react";

export default function SettingsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setBaseURL(json.data.baseURL || "");
          setModel(json.data.model || "");
          setHasKey(!!json.data.hasKey);
          setConfigLoaded(true);
        }
      });
  }, []);

  async function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const body: Record<string, string> = {};
    if (baseURL) body.baseURL = baseURL;
    if (model) body.model = model;
    if (apiKey) body.apiKey = apiKey;

    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setBaseURL(json.data.baseURL || "");
        setModel(json.data.model || "");
        setHasKey(!!json.data.hasKey);
        setApiKey("");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="设置" />
      <PageContainer>
        <div className="space-y-6">
          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              个人信息
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {authLoading ? "加载中..." : user?.username ?? "未登录"}
                </p>
                <p className="text-xs text-muted-foreground">用户名</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              AI 模型配置
            </h3>
            {!configLoaded ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="baseURL" className="text-xs">API 地址</Label>
                  <Input
                    id="baseURL"
                    name="baseURL"
                    placeholder="https://api.moonshot.cn/v1"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="model" className="text-xs">模型名称</Label>
                  <Input
                    id="model"
                    name="model"
                    placeholder="moonshot-v1-auto"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="apiKey" className="text-xs">API Key</Label>
                  <Input
                    id="apiKey"
                    name="apiKey"
                    type="password"
                    placeholder={hasKey ? "已配置，留空不修改" : "sk-... (必填)"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {!hasKey && (
                    <p className="text-xs text-amber-500">
                      需要配置 API Key 才能使用 AI 对话和出题功能
                    </p>
                  )}
                </div>
                <Button type="submit" size="sm" disabled={saving} className="w-full">
                  {saved ? (
                    <span className="flex items-center gap-1"><Check className="size-3" /> 已保存</span>
                  ) : saving ? "保存中..." : "保存配置"}
                </Button>
              </form>
            )}
          </section>

          <Button variant="destructive" className="w-full" onClick={logout}>
            退出登录
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Med-Recallix v0.1.0
          </p>
        </div>
      </PageContainer>
    </>
  );
}
