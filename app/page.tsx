import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

export default async function LandingPage() {
  const session = await auth();

  // Already logged in → redirect to onboarding/dashboard
  if (session?.user) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <Badge variant="secondary" className="mb-4">
            Backed by 1,000+ developers
          </Badge>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            You shipped way more
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
              than you think
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            Turn 6 months of git logs into a mind-blowing performance review.
            <br />
            <span className="font-semibold">In 30 seconds.</span>
          </p>

          {/* CTA */}
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/onboarding" });
            }}
          >
            <Button size="lg" className="h-14 px-8 text-lg gap-2" type="submit">
              <GitHubLogoIcon className="h-5 w-5" />
              Continue with GitHub
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            Free forever • No credit card • 2-minute setup
          </p>

          {/* Live Feed */}
          <Card className="mt-12 max-w-md mx-auto bg-muted/50 border-muted">
            <CardContent className="pt-6">
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex-shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Alex @ Stripe</p>
                    <p className="text-muted-foreground">
                      "Just discovered I shipped 47 features this quarter. No way."
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">2 minutes ago</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex-shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Sarah @ Vercel</p>
                    <p className="text-muted-foreground">
                      "This is going straight into my promotion packet."
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">15 minutes ago</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <div className="max-w-6xl mx-auto mt-32 grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <span className="text-3xl">⚡</span>
              </div>
              <CardTitle>30-Second Setup</CardTitle>
              <CardDescription>
                Connect GitHub → See 6 months of work → Download brag doc
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
                <span className="text-3xl">🤖</span>
              </div>
              <CardTitle>100% Automated</CardTitle>
              <CardDescription>
                Zero manual input. We analyze commits, PRs, reviews, and generate achievement cards.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center mb-4">
                <span className="text-3xl">📊</span>
              </div>
              <CardTitle>Impact Metrics</CardTitle>
              <CardDescription>
                Not just "what you did" but "why it mattered". Performance reviews love this.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Social Proof */}
        <div className="max-w-4xl mx-auto mt-32 text-center">
          <p className="text-sm text-muted-foreground mb-8">
            TRUSTED BY ENGINEERS AT
          </p>
          <div className="flex flex-wrap justify-center gap-8 items-center opacity-50">
            <div className="text-2xl font-bold">Stripe</div>
            <div className="text-2xl font-bold">Vercel</div>
            <div className="text-2xl font-bold">GitHub</div>
            <div className="text-2xl font-bold">Linear</div>
            <div className="text-2xl font-bold">Notion</div>
          </div>
        </div>

        {/* How It Works */}
        <div className="max-w-4xl mx-auto mt-32">
          <h2 className="text-3xl font-bold text-center mb-12">
            How it works
          </h2>

          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Connect GitHub</h3>
                <p className="text-muted-foreground">
                  One click. OAuth. We read your public repos and contributions.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">We Analyze Everything</h3>
                <p className="text-muted-foreground">
                  10 seconds. We scan commits, PRs, code reviews, detect patterns, calculate impact.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Instant Dashboard</h3>
                <p className="text-muted-foreground">
                  "Holy sh*t, I shipped 47 features!" → Download, edit, share with your manager.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="max-w-2xl mx-auto mt-32 text-center">
          <Card className="bg-gradient-to-br from-blue-500 to-violet-500 text-white border-0">
            <CardHeader className="space-y-4 pb-8">
              <CardTitle className="text-3xl">
                Stop underselling yourself
              </CardTitle>
              <CardDescription className="text-blue-50 text-lg">
                Your next promotion starts with knowing what you've actually built.
              </CardDescription>
              <form
                action={async () => {
                  "use server";
                  await signIn("github", { redirectTo: "/onboarding" });
                }}
              >
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-14 px-8 text-lg gap-2 mt-4"
                  type="submit"
                >
                  <GitHubLogoIcon className="h-5 w-5" />
                  Get Started Free
                </Button>
              </form>
            </CardHeader>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-32 border-t">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          <p>Built for developers, by developers.</p>
          <p className="mt-2">© 2025 BragDoc. Open source on GitHub.</p>
        </div>
      </footer>
    </div>
  );
}
