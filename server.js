import express from "express";
import Stripe from "stripe";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// Stripe i webhook secret
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

/* CHECKOUT */
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, discord, email } = req.body;

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
    console.error(err);
    res.status(500).json({ error: "Błąd tworzenia sesji" });
  }
});

/* WEBHOOK - tylko express.raw dla Stripe */
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Błąd webhooka:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const discord = session.metadata.discord;
    const email = session.metadata.email;
    const items = JSON.parse(session.metadata.items);

    try {
      await sendOrderToBrevo(discord, email, items);
      console.log("Mail wysłany:", discord, email, items);
    } catch (err) {
      console.error("Błąd wysyłki maila przez Brevo:", err);
    }
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => console.log("Server running"));
