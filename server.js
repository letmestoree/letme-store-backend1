import express from "express";
import Stripe from "stripe";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* BREVO MAILER */
async function sendOrderMail(discord, email, items) {

  const productList = items.map(i =>
    `${i.name} x${i.quantity} - ${i.price / 100} PLN`
  ).join("\n");

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: "LetMeStore", email: "orders@letmestore.pl" },
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
    const session = event.data.object;
    const discord = session.metadata.discord;
    const email = session.metadata.email;
    const items = JSON.parse(session.metadata.items);

    await sendOrderMail(discord, email, items);
    console.log("Mail wysłany:", discord, email, items);
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => console.log("Server running"));
