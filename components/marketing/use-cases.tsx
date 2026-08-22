import { Brush, Code2, GraduationCap, Video } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const useCases = [
  {
    title: "Content Creators",
    description: "Produce believable wallet clips for storytelling, reels, and educational content.",
    icon: Video,
    tint: "from-cyan-300/25",
  },
  {
    title: "Developers",
    description: "Prototype wallet-centric flows without chain integrations or custodial complexity.",
    icon: Code2,
    tint: "from-emerald-300/25",
  },
  {
    title: "Designers",
    description: "Stress-test layout, typography, and interactions in realistic fintech scenarios.",
    icon: Brush,
    tint: "from-sky-300/25",
  },
  {
    title: "Educators",
    description: "Teach crypto product concepts with safe simulation data and controlled examples.",
    icon: GraduationCap,
    tint: "from-teal-300/25",
  },
];

export function UseCasesSection() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Use Cases"
          title="Built for Teams Who Need Believable Wallet Demos"
          description="Mirage helps teams present, test, and teach without touching real assets or accounts."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {useCases.map((useCase) => {
            const Icon = useCase.icon;
            return (
              <Card key={useCase.title} className="overflow-hidden">
                <div
                  className={`h-1 bg-gradient-to-r ${useCase.tint} via-transparent to-transparent`}
                />
                <CardHeader>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card-soft)] text-cyan-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="pt-2">{useCase.title}</CardTitle>
                  <CardDescription>{useCase.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Safe for training and demonstrations
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
