const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/create-checkout-session", async (req, res) => {
  try {
    const items = req.body.items;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "blik"],
      line_items: items.map(item => ({
        price_data: {
          currency: "pln",
          product_data: {
            name: item.name,
          },
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
