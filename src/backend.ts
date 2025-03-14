import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import { CreateOrderRequest, Order as OrderInfo } from "./types";
import { createHmac } from "crypto";

interface Order {
  id: number;
  zaloUserId: string;
  checkoutSdkOrderId?: number;
  info: OrderInfo;
}
interface Schema {
  orders: Order[];
}

config();
const port = process.env.PORT || 10000;
const db = new LowSync(new JSONFileSync<Schema>("db.json"), { orders: [] });
db.read();

express()
  .use(express.json())
  .use(cors({ origin: ["https://h5.zdn.vn", "http://localhost:3000"] }))
  .get("/", async (req, res) => {
    res.json({
      message: "Đây là backend cho CheckoutSDK Tutorial!",
    });
  })
  .get("/products", async (req, res) => {
    res.json((await import("./mock/products.json")).default);
  })
  .get("/categories", async (req, res) => {
    res.json((await import("./mock/categories.json")).default);
  })
  .get("/banners", async (req, res) => {
    res.json((await import("./mock/banners.json")).default);
  })
  .get("/stations", async (req, res) => {
    res.json((await import("./mock/stations.json")).default);
  })
  .get("/orders", async (req, res) => {
    const allOrders = db.data.orders;
    const orderInfos = allOrders.map((order) => order.info).reverse();
    res.json(orderInfos);
  })
  .post("/orders", async (req, res) => {
    const { zaloUserId, items, total } = req.body as CreateOrderRequest;
    const id = db.data.orders.length + 1;
    const order: Order = {
      id,
      zaloUserId,
      info: {
        id,
        items,
        total,
        delivery: {
          type: "pickup",
          stationId: 1,
        },
        note: "",
        createdAt: new Date(),
        receivedAt: new Date(),
        status: "pending",
        paymentStatus: "pending",
      },
    };
    db.data.orders.push(order);
    db.write();
    res.json({
      message: "Đã tạo đơn hàng thành công!",
      orderId: order.id,
    });
  })
  .post("/mac", async (req, res) => {
    const { amount, desc, item, extradata, method } = req.body;
    const params = { amount, desc, item, extradata, method };
    const dataMac = Object.keys(params)
      .sort()
      .map(
        (key) =>
          `${key}=${
            typeof params[key] === "object"
              ? JSON.stringify(params[key])
              : params[key]
          }`
      )
      .join("&");
    const mac = createHmac("sha256", process.env.CHECKOUT_SDK_PRIVATE_KEY!)
      .update(dataMac)
      .digest("hex");
    res.json({ mac });
  })
  .listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
