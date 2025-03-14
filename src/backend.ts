import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import { Order as OrderInfo } from "./types";

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
  .listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
