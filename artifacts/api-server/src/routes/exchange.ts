import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GetExchangeRatesQueryParams, ConvertCurrencyBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { randomBytes } from "crypto";

const router = Router();

// Simple in-memory rate cache (TTL 60s)
let rateCache: { timestamp: number; rates: Record<string, number> } | null = null;
const CACHE_TTL = 60_000;

async function fetchRates(base: string = "USD"): Promise<Record<string, number>> {
  const now = Date.now();
  if (rateCache && now - rateCache.timestamp < CACHE_TTL) {
    return rateCache.rates;
  }

  try {
    // Use open.er-api.com free tier (no API key required)
    const resp = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!resp.ok) throw new Error("Rate fetch failed");
    const data = await resp.json() as { rates: Record<string, number>; time_last_update_unix: number };
    rateCache = { timestamp: now, rates: data.rates };
    return data.rates;
  } catch {
    // Fallback to approximate rates if API unavailable
    return getFallbackRates(base);
  }
}

function getFallbackRates(base: string): Record<string, number> {
  const usdRates: Record<string, number> = {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
    CHF: 0.90, CNY: 7.24, INR: 83.2, MXN: 17.1, BRL: 4.97, NGN: 1600,
    ZAR: 18.6, AED: 3.67, SAR: 3.75, SGD: 1.34, HKD: 7.82, KRW: 1325,
    SEK: 10.4, NOK: 10.6, DKK: 6.89, NZD: 1.63, THB: 35.1, PHP: 56.7,
    MYR: 4.72, IDR: 15700, TRY: 32.1, PLN: 4.07, CZK: 22.9, HUF: 365,
  };
  if (base === "USD") return usdRates;
  const baseRate = usdRates[base] ?? 1;
  const result: Record<string, number> = {};
  for (const [cur, rate] of Object.entries(usdRates)) {
    result[cur] = rate / baseRate;
  }
  return result;
}

router.get("/exchange/rates", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = GetExchangeRatesQueryParams.safeParse(req.query);
  const base = parse.success ? (parse.data.base ?? "USD") : "USD";

  try {
    const rates = await fetchRates(base);
    const entries = Object.entries(rates).map(([code, rate]) => ({ code, rate }));
    res.json({
      base,
      timestamp: Math.floor(Date.now() / 1000),
      entries,
    });
  } catch (err) {
    req.log.error({ err }, "getExchangeRates error");
    res.status(500).json({ error: "Failed to fetch exchange rates" });
  }
});

router.post("/exchange/convert", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = ConvertCurrencyBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  const { fromCurrency, toCurrency, amount, fromAccountId, toAccountId, execute } = parse.data;

  try {
    const rates = await fetchRates(fromCurrency);
    const rate = rates[toCurrency];
    if (!rate) { res.status(400).json({ error: `Unsupported currency: ${toCurrency}` }); return; }

    const fee = amount * 0.005; // 0.5% fee
    const toAmount = (amount - fee) * rate;

    let transactionId: number | null = null;

    if (execute && fromAccountId && toAccountId) {
      const uid = await getUserId(clerkId);
      if (!uid) { res.status(404).json({ error: "User not found" }); return; }

      const [fromAcc] = await db.select().from(accountsTable)
        .where(and(eq(accountsTable.id, fromAccountId), eq(accountsTable.userId, uid)));
      if (!fromAcc) { res.status(404).json({ error: "Source account not found" }); return; }
      if (fromAcc.balance < amount) { res.status(400).json({ error: "Insufficient funds" }); return; }

      const [toAcc] = await db.select().from(accountsTable)
        .where(and(eq(accountsTable.id, toAccountId), eq(accountsTable.userId, uid)));
      if (!toAcc) { res.status(404).json({ error: "Destination account not found" }); return; }

      const ref = "TCB" + randomBytes(4).toString("hex").toUpperCase();
      await db.update(accountsTable).set({ balance: fromAcc.balance - amount, updatedAt: new Date() }).where(eq(accountsTable.id, fromAccountId));
      await db.update(accountsTable).set({ balance: toAcc.balance + toAmount, updatedAt: new Date() }).where(eq(accountsTable.id, toAccountId));

      const [tx] = await db.insert(transactionsTable).values({
        accountId: fromAccountId,
        type: "exchange",
        amount,
        currency: fromCurrency,
        status: "completed",
        description: `Currency exchange: ${fromCurrency} to ${toCurrency}`,
        reference: ref,
        balanceAfter: fromAcc.balance - amount,
      }).returning();
      transactionId = tx.id;
    }

    res.json({
      fromCurrency,
      toCurrency,
      fromAmount: amount,
      toAmount,
      rate,
      fee,
      timestamp: Math.floor(Date.now() / 1000),
      transactionId,
    });
  } catch (err) {
    req.log.error({ err }, "convertCurrency error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
