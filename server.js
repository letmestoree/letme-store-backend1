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
  const productList = items.map(i =>
    `${i.name} x${i.quantity} - ${(i.price / 100).toFixed(2)} PLN`
  ).join("\n");

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: "letme.store", email: "letme.store@letme.hub.pl" },
      to: [{ email: process.env.BREVO_RECEIVER }],
      subject: "NOWE ZAMÓWIENIE",
      textContent: `NOWE ZAMÓWIENIE

Discord: ${discord}
Email: ${email}

Produkty:
${productList}`
    })
  });
}

/* DISCORD WEBHOOK */
async function sendOrderToDiscord(discordUser, emailUser, items) {
  const productList = items.map(i =>
    `• ${i.name} x${i.quantity} - ${(i.price/100).toFixed(2)} PLN`
  ).join("\n");

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
            { name: "Produkty", value: productList }
          ],
          color: 5814783
        }
      ]
    })
  });
}

/* CHECKOUT */
app.post("/create-checkout-session", async (req, res) => {
  try {
    const items = req.body.items;
    const discord = req.body.discord;
    const email = req.body.email;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "blik", "paypal"],
      line_items: items.map(item => ({
        price_data: {
          currency: "pln",
          product_data: { name: item.name },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      })),
      metadata: {
        discord,
        email,
        items: JSON.stringify(items)
      },
      success_url: "https://letmestore.pl/success.html",
      cancel_url: "https://letmestore.pl/cancel.html",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Błąd tworzenia sesji" });
  }
});

/* WEBHOOK */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = req.body;

  if (event.type === "checkout.session.completed") {
    try {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id);

      const discord = session.metadata.discord;
      const email = session.metadata.email;
      const items = JSON.parse(session.metadata.items);

      // Wyślij maila
      await sendOrderToBrevo(discord, email, items);

      // Wyślij powiadomienie na Discord (ping roli)
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
});

app.listen(process.env.PORT || 3000, () => console.log("Server running"));
