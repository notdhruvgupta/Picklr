"use client";

import type { ReactNode } from "react";
import { WhenReady } from "@/components/loading";
import { Card, PageTitle } from "@/components/ui";
import { useData } from "@/lib/data/store";
import { expectedScore, movMultiplier } from "@/lib/elo";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-2 p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted [&_strong]:text-text">{children}</div>
    </Card>
  );
}

function About() {
  const { config } = useData();
  const mov = (a: number, b: number) => movMultiplier([{ a, b }], 11, config).toFixed(2);
  const gain = Math.round(config.kEstablished * (1 - expectedScore(1500, 1600)));
  return (
    <div className="space-y-4">
      <PageTitle subtitle="Every number on this site can be traced back to these rules.">How ratings work</PageTitle>

      <Block title="Elo in one paragraph">
        <p>
          Everyone has a rating. Before each match the app works out how likely each side is to win from the rating gap. Win when you were expected to
          lose and you gain a lot; win when you were expected to win and you gain a little. Points move from the losers to the winners, so the group&apos;s
          average stays put.
        </p>
        <p>
          A <strong>100-point</strong> gap means the stronger side is expected to win about <strong>64%</strong> of the time; 200 points is about{" "}
          <strong>76%</strong>.
        </p>
      </Block>

      <Block title="Doubles and singles are separate">
        <p>
          You have a <strong>doubles rating</strong> and a <strong>singles rating</strong>, and each only moves in its own kind of match. In doubles a
          team&apos;s strength is the average of its two players, and both partners win or lose the same amount (unless one is still new, see below).
        </p>
      </Block>

      <Block title="The formula">
        <p className="font-mono text-xs text-text">change = K × margin × (result − expected)</p>
        <p>
          <strong>result</strong> is 1 for a win and 0 for a loss. <strong>expected</strong> is the pre-match win chance. So an underdog at 36% who wins
          gets {config.kEstablished} × (1 − 0.36) ≈ <strong>+{gain}</strong> at a typical margin.
        </p>
      </Block>

      <Block title="K: how fast ratings move">
        <p>
          For a player&apos;s first <strong>{config.provisionalMatches}</strong> matches of each kind, K is <strong>{config.kProvisional}</strong>, so new
          players find their level quickly. After that K is <strong>{config.kEstablished}</strong>.
        </p>
      </Block>

      <Block title="Margin of victory">
        {config.marginOfVictory ? (
          <p>
            Bigger wins count for more: 11–9 counts <strong>×{mov(11, 9)}</strong>, 11–6 <strong>×{mov(11, 6)}</strong>, and 11–0{" "}
            <strong>×{mov(11, 0)}</strong>. Rally-scoring games to 15 or 21 are scaled to the same 11-point yardstick. In a best-of-3 the average margin
            per game is used.
          </p>
        ) : (
          <p>Margin of victory is switched off: a win is a win, whatever the score.</p>
        )}
      </Block>

      <Block title="Where starting ratings came from">
        <p>
          Before the app, the group had 1–10 player ratings and a record of who won. Each player started at{" "}
          <strong>1500 + 100 × (their 1–10 rating − the group average)</strong>, then got a small nudge for every recorded win (counted as a win over an
          average team). Ratings then move from there with every match. The referee can adjust any starting rating, and the whole history is replayed.
        </p>
      </Block>

      <Block title="Edits are safe">
        <p>
          Ratings are never stored. They&apos;re recalculated from the full match history every time, so when the referee corrects a score, voids a match,
          or changes a setting, every rating, chart and streak updates to exactly what it would have been.
        </p>
      </Block>

      <Block title="Sessions: who plays next">
        <p>
          On session days the app suggests each next match: players who&apos;ve played the fewest games (and waited longest) go on first, partners
          you&apos;ve already had today are avoided, and teams are split so the game is as close to 50/50 as possible.
        </p>
      </Block>
    </div>
  );
}

export function AboutView() {
  return (
    <WhenReady>
      <About />
    </WhenReady>
  );
}
