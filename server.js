const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Funkcja do wysyłki maila
async function sendEmail(customerEmail, discordNick, cartItems) {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  let itemsText = cartItems
    .map(item => `${item.name} x${item.quantity} – ${(item.price*item.quantity/100).toFixed(2)} PLN`)
    .join("\n");

  let mailOptions = {
    from: `"letme.store" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER, // Twój Gmail, na który przyjdzie powiadomienie
    subject: `Nowe zamówienie od ${discordNick}`,
    text: `Nick Discord: ${discordNick}\nE-mail: ${customerEmail}\n\nProdukty:\n${itemsText}`,
  };

  await transporter.sendMail(mailOptions);
}

// Endpoint tworzący sesję Stripe i wysyłający maila
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, discordNick, email } = req.body; // <- odbieramy nick i email

    // 1️⃣ Wyślij maila
    await sendEmail(email, discordNick, items);

    // 2️⃣ Tworzymy sesję Stripe
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
      success_url: "https://letme.store/success.html",
      cancel_url: "https://letme.store/cancel.html",
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Błąd tworzenia sesji" });
  }
});

app.listen(process.env.PORT || 3000);
