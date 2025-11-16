"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Achievement {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  tags: string[];
  projectName: string | null;
}

interface DailyBrag {
  id: string;
  userId: string;
  date: string;
  autoSummary: string;
  userEditedSummary: string | null;
  status: string;
  impactScore: number;
  workEventsCount: number;
  achievements: Achievement[];
}

export default function BragDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [brag, setBrag] = useState<DailyBrag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchBrag();
  }, [id]);

  const fetchBrag = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/brag/${id}`);
      const data = await response.json();

      if (data.success) {
        setBrag(data.brag);
        setEditedSummary(data.brag.userEditedSummary || data.brag.autoSummary);
      } else {
        setError(data.error || "Failed to fetch brag");
      }
    } catch (err) {
      setError("Network error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!brag) return;

    try {
      setSaving(true);
      const response = await fetch("/api/brag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: brag.id,
          userEditedSummary: editedSummary,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBrag({ ...brag, userEditedSummary: editedSummary });
        setIsEditing(false);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch (err) {
      setError("Network error");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!brag) return;

    try {
      const response = await fetch("/api/brag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: brag.id,
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBrag({ ...brag, status: newStatus });
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch (err) {
      setError("Network error");
      console.error(err);
    }
  };

  const handleCopy = async () => {
    if (!brag) return;
    const text = brag.userEditedSummary || brag.autoSummary;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    if (!brag) return;
    const text = brag.userEditedSummary || brag.autoSummary;
    const date = new Date(brag.date).toISOString().split("T")[0];
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brag-doc-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getImpactColor = (score: number) => {
    if (score >= 60) return "text-red-600 dark:text-red-400";
    if (score >= 30) return "text-yellow-600 dark:text-yellow-400";
    return "text-gray-600 dark:text-gray-400";
  };

  const getImpactBadge = (impact: string) => {
    const styles = {
      high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    };
    return styles[impact as keyof typeof styles] || styles.low;
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !brag) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error || "Brag not found"}</p>
          <Link
            href="/dashboard"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const date = new Date(brag.date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Group achievements by project
  const achievementsByProject = brag.achievements.reduce((acc, achievement) => {
    const project = achievement.projectName || "기타";
    if (!acc[project]) {
      acc[project] = [];
    }
    acc[project].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>);

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
          >
            ← Back to Dashboard
          </Link>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
            <button
              onClick={handleExportMarkdown}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              ⬇️ Export MD
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">{date}</h1>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    📊 {brag.workEventsCount} events
                  </span>
                  <span className={getImpactColor(brag.impactScore)}>
                    🔥 Impact: {brag.impactScore}/100
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    🎯 {brag.achievements.length} achievements
                  </span>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(
                  brag.status
                )}`}
              >
                {brag.status}
              </span>
            </div>

            {/* Status Change Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleStatusChange("draft")}
                disabled={brag.status === "draft"}
                className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Draft
              </button>
              <button
                onClick={() => handleStatusChange("reviewed")}
                disabled={brag.status === "reviewed"}
                className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reviewed
              </button>
              <button
                onClick={() => handleStatusChange("approved")}
                disabled={brag.status === "approved"}
                className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Approved
              </button>
            </div>
          </div>

          {/* Summary Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📝 Summary</h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  ✏️ Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedSummary(brag.userEditedSummary || brag.autoSummary);
                    }}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : "💾 Save"}
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="w-full h-96 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm"
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300">
                  {brag.userEditedSummary || brag.autoSummary}
                </pre>
              </div>
            )}
          </div>

          {/* Achievements Section */}
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">🏆 Achievements by Project</h2>
            <div className="space-y-6">
              {Object.entries(achievementsByProject).map(([project, achievements]) => (
                <div key={project} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="text-lg font-semibold mb-3">{project}</h3>
                  <div className="space-y-3">
                    {achievements.map((achievement) => (
                      <div
                        key={achievement.id}
                        className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            {achievement.title}
                          </h4>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${getImpactBadge(
                              achievement.impact
                            )}`}
                          >
                            {achievement.impact}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {achievement.description}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 rounded">
                            {achievement.category}
                          </span>
                          {achievement.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
