"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import confetti from "canvas-confetti";

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
  date: Date;
  periodType: string;
  periodEnd: Date | null;
  autoSummary: string | null;
  userEditedSummary: string | null;
  status: string;
  impactScore: number;
  workEventsCount: number;
  achievements: Achievement[];
}

interface TotalStats {
  totalEvents: number;
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  features: number;
  bugs: number;
}

interface DashboardClientProps {
  initialBrags: DailyBrag[];
  userId: string;
  userName: string;
  userEmail: string;
  firstTime: boolean;
  totalStats: TotalStats;
}

export function DashboardClient({
  initialBrags,
  userId,
  userName,
  userEmail,
  firstTime,
  totalStats,
}: DashboardClientProps) {
  const router = useRouter();
  const [brags, setBrags] = useState<DailyBrag[]>(initialBrags);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [showWow, setShowWow] = useState(firstTime);

  useEffect(() => {
    if (firstTime && brags.length > 0) {
      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Auto-hide WOW modal after 5 seconds
      setTimeout(() => {
        setShowWow(false);
      }, 5000);
    }
  }, [firstTime, brags.length]);

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
        router.refresh();
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

  const handleExport = (brag: DailyBrag) => {
    const text = brag.userEditedSummary || brag.autoSummary || "";
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

  const totalEvents = brags.reduce((sum, brag) => sum + brag.workEventsCount, 0);
  const totalAchievements = brags.reduce((sum, brag) => sum + brag.achievements.length, 0);
  const avgImpact = brags.length > 0
    ? Math.round(brags.reduce((sum, brag) => sum + brag.impactScore, 0) / brags.length)
    : 0;

  // Separate weekly and daily brags
  const weeklyBrags = brags.filter((brag) => brag.periodType === "weekly");
  const dailyBrags = brags.filter((brag) => brag.periodType === "daily");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* WOW Modal */}
      {showWow && brags.length > 0 && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                <span className="text-5xl">🎉</span>
              </div>
              <CardTitle className="text-4xl">
                Holy sh*t, look at what you built!
              </CardTitle>
              <CardDescription className="text-xl">
                Your last 6 months in numbers
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600">{totalEvents}</div>
                  <div className="text-sm text-muted-foreground">Events tracked</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-violet-600">{totalAchievements}</div>
                  <div className="text-sm text-muted-foreground">Achievements</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-pink-600">{avgImpact}</div>
                  <div className="text-sm text-muted-foreground">Avg Impact</div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💪</span>
                  <span className="text-lg">You're in the <strong>top 10%</strong> of engineers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🚀</span>
                  <span className="text-lg">You ship <strong>3x faster</strong> than average</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔥</span>
                  <span className="text-lg">Your code reviews are <strong>top 5%</strong></span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="lg"
                  onClick={() => setShowWow(false)}
                  className="flex-1"
                >
                  Let's go! 🎯
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Dashboard */}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">
              Welcome back, {userName}!
            </h1>
            <p className="text-muted-foreground mt-2">
              Your automated achievement tracker
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/">← Home</Link>
            </Button>
          </div>
        </div>

        {/* Hero Stats Section */}
        <Card className="mb-8 bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border-2">
          <CardHeader>
            <CardTitle className="text-2xl">Your Total Impact</CardTitle>
            <CardDescription className="text-base">
              All-time stats from your GitHub activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">{totalStats.totalEvents}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Events</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-violet-600">{totalStats.commits}</div>
                <div className="text-sm text-muted-foreground mt-1">Commits</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-pink-600">{totalStats.prs}</div>
                <div className="text-sm text-muted-foreground mt-1">Pull Requests</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-orange-600">{totalStats.reviews}</div>
                <div className="text-sm text-muted-foreground mt-1">PR Reviews</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{totalStats.features}</div>
                <div className="text-sm text-muted-foreground mt-1">Features</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-red-600">{totalStats.bugs}</div>
                <div className="text-sm text-muted-foreground mt-1">Bugs Fixed</div>
              </div>
              <div className="text-center p-4 bg-background/50 rounded-lg">
                <div className="text-3xl font-bold text-yellow-600">{totalStats.issues}</div>
                <div className="text-sm text-muted-foreground mt-1">Issues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Events</CardDescription>
              <CardTitle className="text-3xl">{totalEvents}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Achievements</CardDescription>
              <CardTitle className="text-3xl">{totalAchievements}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg Impact</CardDescription>
              <CardTitle className={`text-3xl ${getImpactColor(avgImpact)}`}>
                {avgImpact}/100
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Brag Docs</CardDescription>
              <CardTitle className="text-3xl">{brags.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="mb-8">
          <Button
            onClick={generateTodaysBrag}
            disabled={generating}
            size="lg"
          >
            {generating ? "⏳ Generating..." : "✨ Generate Today's Brag"}
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="mb-8 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">❌ {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Brag Docs List */}
        {brags.length === 0 ? (
          <Card>
            <CardHeader className="text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                <span className="text-4xl">📄</span>
              </div>
              <CardTitle className="text-2xl">No Brag Docs Yet</CardTitle>
              <CardDescription className="text-lg">
                Click "Generate Today's Brag" to create your first one!
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Weekly Summaries Section */}
            {weeklyBrags.length > 0 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold">📅 Weekly Summaries</h2>
                  <p className="text-muted-foreground">High-level overview of your weekly progress</p>
                </div>
                <div className="grid gap-4">
                  {weeklyBrags.map((brag) => {
                    const startDate = new Date(brag.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                    const endDate = brag.periodEnd
                      ? new Date(brag.periodEnd).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "";

                    return (
                      <Card key={brag.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-xl">
                                Week of {startDate} - {endDate}
                              </CardTitle>
                              <div className="flex items-center gap-3 mt-2">
                                <Badge variant="secondary">
                                  📊 {brag.workEventsCount} events
                                </Badge>
                                <Badge variant="secondary" className={getImpactColor(brag.impactScore)}>
                                  🔥 {brag.impactScore}/100
                                </Badge>
                                <Badge variant="secondary">
                                  🎯 {brag.achievements.length} achievements
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          <div className="prose dark:prose-invert max-w-none">
                            <p className="line-clamp-2 text-sm">
                              {brag.userEditedSummary || brag.autoSummary}
                            </p>
                          </div>

                          <div className="flex gap-3 pt-2 border-t">
                            <Button variant="link" asChild className="p-0">
                              <Link href={`/dashboard/${brag.id}`}>
                                View Details →
                              </Link>
                            </Button>
                            <Button
                              variant="link"
                              onClick={() => handleExport(brag)}
                              className="p-0"
                            >
                              Export
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Brags Section */}
            {dailyBrags.length > 0 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold">📝 Daily Brags</h2>
                  <p className="text-muted-foreground">Detailed daily activity records</p>
                </div>
                <div className="grid gap-4">
                  {dailyBrags.map((brag) => {
                    const date = new Date(brag.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    });

                    return (
                      <Card key={brag.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-violet-500">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-xl">{date}</CardTitle>
                              <div className="flex items-center gap-3 mt-2">
                                <Badge variant="secondary">
                                  📊 {brag.workEventsCount} events
                                </Badge>
                                <Badge variant="secondary" className={getImpactColor(brag.impactScore)}>
                                  🔥 {brag.impactScore}/100
                                </Badge>
                                <Badge variant="secondary">
                                  🎯 {brag.achievements.length} achievements
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          <div className="prose dark:prose-invert max-w-none">
                            <p className="line-clamp-3 text-sm">
                              {brag.userEditedSummary || brag.autoSummary}
                            </p>
                          </div>

                          {brag.achievements.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {brag.achievements.slice(0, 3).map((achievement) => (
                                <Badge key={achievement.id} variant="outline">
                                  {achievement.impact === "high" ? "🔥" : "📈"}{" "}
                                  {achievement.title.substring(0, 40)}
                                  {achievement.title.length > 40 ? "..." : ""}
                                </Badge>
                              ))}
                              {brag.achievements.length > 3 && (
                                <Badge variant="outline">
                                  +{brag.achievements.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}

                          <div className="flex gap-3 pt-4 border-t">
                            <Button variant="link" asChild className="p-0">
                              <Link href={`/dashboard/${brag.id}`}>
                                View Details →
                              </Link>
                            </Button>
                            <Button
                              variant="link"
                              onClick={() => handleExport(brag)}
                              className="p-0"
                            >
                              Export
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
