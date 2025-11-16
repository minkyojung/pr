"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const ANALYSIS_STEPS = [
  { message: "📊 Scanning repositories...", duration: 2000 },
  { message: "✅ Found repositories", duration: 1000 },
  { message: "🔍 Analyzing commits...", duration: 3000 },
  { message: "✅ Processed commits", duration: 1000 },
  { message: "🎯 Detecting achievements...", duration: 2000 },
  { message: "✅ Identified achievements", duration: 1000 },
  { message: "✨ Generating your impact report...", duration: 2000 },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(true);

  useEffect(() => {
    async function runAnalysis() {
      try {
        // Start ETL
        const response = await fetch("/api/onboarding/analyze", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Analysis failed");
        }

        const data = await response.json();

        // Show completion
        setProgress(100);
        setCurrentStep(ANALYSIS_STEPS.length - 1);

        // Wait a moment then redirect
        setTimeout(() => {
          router.push("/dashboard?firstTime=true");
        }, 2000);
      } catch (error) {
        console.error("Analysis error:", error);
        // Still redirect to dashboard even on error
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      }
    }

    // Simulate progress UI while actual ETL runs in background
    let step = 0;
    let totalDuration = 0;

    const advanceStep = () => {
      if (step < ANALYSIS_STEPS.length) {
        setCurrentStep(step);
        const stepDuration = ANALYSIS_STEPS[step].duration;
        totalDuration += stepDuration;
        setProgress(((step + 1) / ANALYSIS_STEPS.length) * 100);

        step++;
        if (step < ANALYSIS_STEPS.length) {
          setTimeout(advanceStep, stepDuration);
        }
      }
    };

    // Start UI animation
    advanceStep();

    // Start actual ETL
    runAnalysis();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center animate-pulse">
            <span className="text-3xl">🚀</span>
          </div>
          <CardTitle className="text-3xl">
            {analyzing ? "Analyzing your work..." : "Analysis complete!"}
          </CardTitle>
          <CardDescription className="text-lg">
            {analyzing
              ? "We're scanning your GitHub activity. This takes about 10 seconds."
              : "Get ready to see what you've built! 🎉"
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-center text-muted-foreground">
              {Math.round(progress)}% complete
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3 mt-8">
            {ANALYSIS_STEPS.map((step, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 transition-opacity ${
                  index <= currentStep ? "opacity-100" : "opacity-30"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    index < currentStep
                      ? "bg-green-500 text-white"
                      : index === currentStep
                      ? "bg-blue-500 text-white animate-pulse"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-500"
                  }`}
                >
                  {index < currentStep ? "✓" : index + 1}
                </div>
                <p
                  className={`text-sm ${
                    index <= currentStep
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.message}
                </p>
              </div>
            ))}
          </div>

          {/* Fun fact */}
          <Card className="bg-muted/50 border-muted mt-8">
            <CardContent className="pt-6">
              <p className="text-sm text-center text-muted-foreground italic">
                💡 Did you know? Most developers forget 80% of what they shipped by performance review time.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
