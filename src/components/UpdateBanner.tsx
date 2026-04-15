import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function UpdateBanner() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    check()
      .then((update) => {
        if (update?.available) {
          setNewVersion(update.version);
        }
      })
      .catch(() => {
        // 업데이트 확인 실패 시 조용히 무시
      });
  }, []);

  if (!newVersion) return null;

  const handleUpdate = async () => {
    setInstalling(true);
    try {
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: "#1e293b",
        color: "#f1f5f9",
        borderRadius: 10,
        padding: "12px 18px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 14,
      }}
    >
      <span>
        새 버전 <strong>{newVersion}</strong> 이 출시됐어요!
      </span>
      <button
        onClick={handleUpdate}
        disabled={installing}
        style={{
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "6px 14px",
          cursor: installing ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: 13,
          opacity: installing ? 0.7 : 1,
        }}
      >
        {installing ? "설치 중..." : "업데이트"}
      </button>
      {!installing && (
        <button
          onClick={() => setNewVersion(null)}
          style={{
            background: "transparent",
            color: "#94a3b8",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
