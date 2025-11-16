"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Achievement {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  tags: string[];
}

interface DailyBrag {
  id: string;
  date: string;
  autoSummary: string;
  userEditedSummary: string | null;
  status: string;
  impactScore: number;
  workEventsCount: number;
  achievements: Achievement[];
}

export default function Dashboard() {
  const [brags, setBrags] = useState<DailyBrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const userId = "test-user-1"; // TODO: 실제 인증 시스템 연동

  useEffect(() => {
    fetchBrags();
  }, []);

  const fetchBrags = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/brag?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setBrags(data.brags);
      } else {
        setError(data.error || "Failed to fetch brags");
      }
    } catch (err) {
      setError("Network error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateTodaysBrag = async () => {
    try {
      setGenerating(true);
      setError("");

      const response = await fetch("/api/brag/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh list
        await fetchBrags();
      } else {
        setError(data.error || "Failed to generate brag");
      }
    } catch (err) {
      setError("Network error");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const getImpactColor = (score: number) => {
    if (score >= 60) return "text-red-600 dark:text-red-400";
    if (score >= 30) return "text-yellow-600 dark:text-yellow-400";
    return "text-gray-600 dark:text-gray-400";
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

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            📝 Daily Brag Docs
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Your automated achievement tracker
          </p>
        </div>

        {/* Action Bar */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={generateTodaysBrag}
            disabled={generating}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {generating ? "⏳ Generating..." : "✨ Generate Today's Brag"}
          </button>

          <Link
            href="/"
            className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
          >
            ← Home
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 rounded-lg">
            <p className="text-red-800 dark:text-red-200">❌ {error}</p>
          </div>
        )}

        {/* Brag Docs List */}
        {brags.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-2xl font-semibold mb-2">No Brag Docs Yet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Click "Generate Today's Brag" to create your first one!
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {brags.map((brag) => {
              const date = new Date(brag.date).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

              return (
                <div
                  key={brag.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold mb-1">{date}</h3>
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

                    {/* Summary Preview */}
                    <div className="prose dark:prose-invert max-w-none">
                      <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4">
                        {brag.userEditedSummary || brag.autoSummary}
                      </div>
                    </div>

                    {/* Achievements Preview */}
                    {brag.achievements.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {brag.achievements.slice(0, 3).map((achievement) => (
                          <div
                            key={achievement.id}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs"
                          >
                            {achievement.impact === "high" ? "🔥" : "📈"}{" "}
                            {achievement.title.substring(0, 40)}
                            {achievement.title.length > 40 ? "..." : ""}
                          </div>
                        ))}
                        {brag.achievements.length > 3 && (
                          <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">
                            +{brag.achievements.length - 3} more
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                      <Link
                        href={`/dashboard/${brag.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                      >
                        View Details →
                      </Link>
                      <button className="text-gray-600 dark:text-gray-400 hover:underline text-sm">
                        Export
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
