import express from "express";
import Stripe from "stripe";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* BREVO MAILER */
async function sendOrderToBrevo(discord, email, items) {
  const productList = items
    .map(
      (i) =>
        `${i.name} x${i.quantity} - ${(i.price / 100).toFixed(2)} PLN`
    )
    .join("\n");

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "letme.store", email: "letme.store@letme.hub.pl" },
      to: [{ email: process.env.BREVO_RECEIVER }],
      subject: "NOWE ZAMÓWIENIE",
      textContent: `NOWE ZAMÓWIENIE

Discord: ${discord}
Email: ${email}

Produkty:
${productList}`,
    }),
  });
}

/* DISCORD WEBHOOK */
async function sendOrderToDiscord(discordUser, emailUser, items) {
  const productList = items
    .map(
      (i) =>
        `• ${i.name} x${i.quantity} - ${(i.price / 100).toFixed(2)} PLN`
    )
    .join("\n");

  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `<@&1475514251920670831> 📦 **Nowe zamówienie!**`,
      embeds: [
        {
          title: "Szczegóły zamówienia",
          fields: [
            { name: "Discord", value: discordUser || "brak", inline: true },
            { name: "Email", value: emailUser || "brak", inline: true },
            { name: "Produkty", value: productList },
          ],
          color: 5814783,
        },
      ],
    }),
  });
}

/* CHECKOUT – z obsługą rabatu */
app.post("/create-checkout-session", async (req, res) => {
  try {
    const items = req.body.items || [];
    const discord = req.body.discord || "";
    const email = req.body.email || "";

    const promoCode = (req.body.promoCode || "").toUpperCase();
    const totalFromClient = Number(req.body.total) || 0;        // grosze
    const payableFromClient = Number(req.body.payable) || 0;    // grosze
    const discountFromClient = Number(req.body.discountAmount) || 0;

    // 1. policz total po stronie backendu na podstawie items
    const backendTotal = items.reduce(
      (sum, item) =>
        sum +
        Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    // 2. policz rabat po stronie backendu
    let backendDiscount = 0;
    if (promoCode === "LETME15") {
      backendDiscount = Math.round(backendTotal * 0.15);
    }

    const backendPayable = Math.max(backendTotal - backendDiscount, 0);

    // Kwota, którą faktycznie obciążamy klienta (grosze)
    const amountToCharge = backendPayable;

    // 3. Tworzymy SESJĘ STRIPE z jedną pozycją na kwotę po rabacie
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // payment_method_types możesz zostawić jak w dokumentacji Stripe;
      // jeśli chcesz BLIK / PayPal, konfigurujesz to w panelu Stripe.
      payment_method_types: ["card", "blik", "paypal"],

      line_items: [
        {
          price_data: {
            currency: "pln",
            product_data: {
              name: "Zamówienie letme.store",
              description:
                promoCode === "LETME15"
                  ? "Zamówienie z rabatem LETME15 (-15%)"
                  : "Zamówienie w sklepie letme.store",
            },
            unit_amount: amountToCharge,
          },
          quantity: 1,
        },
      ],

      metadata: {
        discord,
        email,
        items: JSON.stringify(items),

        promoCode,
        backendTotal: backendTotal.toString(),
        backendDiscount: backendDiscount.toString(),
        backendPayable: backendPayable.toString(),

        clientTotal: totalFromClient.toString(),
        clientPayable: payableFromClient.toString(),
        clientDiscount: discountFromClient.toString(),
      },

      success_url: "https://letmestore.pl/success.html",
      cancel_url: "https://letmestore.pl/cancel.html",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log("Błąd tworzenia sesji Stripe:", err);
    res.status(500).json({ error: "Błąd tworzenia sesji" });
  }
});

/* WEBHOOK */
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = req.body;

    if (event.type === "checkout.session.completed") {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          event.data.object.id
        );

        const discord = session.metadata.discord;
        const email = session.metadata.email;
        const items = JSON.parse(session.metadata.items);

        await sendOrderToBrevo(discord, email, items);
        await sendOrderToDiscord(discord, email, items);

        console.log("Mail i Discord wysłane:", discord, email, items);
        res.sendStatus(200);
      } catch (err) {
        console.error("Błąd webhooka:", err);
        res.status(500).send("Błąd webhooka");
      }
    } else {
      res.sendStatus(200);
    }
  }
);

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
