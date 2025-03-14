import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import { CreateOrderRequest, Order as OrderInfo } from "./types";
import { createHmac } from "crypto";
import axios from "axios";

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
  .post("/link", async (req, res) => {
    const { orderId, checkoutSdkOrderId, miniAppId } = req.body;
    const order = db.data.orders.find((order) => order.id === orderId);
    if (!order) {
      res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    } else {
      order.checkoutSdkOrderId = checkoutSdkOrderId;
      db.write();
      setTimeout(async () => {
        if (order.info.paymentStatus === "pending") {
          const dataMac = `appId=${miniAppId}&orderId=${checkoutSdkOrderId}&privateKey=${process.env.CHECKOUT_SDK_PRIVATE_KEY}`;
          const mac = createHmac(
            "sha256",
            process.env.CHECKOUT_SDK_PRIVATE_KEY!
          )
            .update(dataMac)
            .digest("hex");
          const {
            data: { data },
          } = await axios<{ data: { returnCode: 0 | 1 | -1 } }>(
            "https://payment-mini.zalo.me/api/transaction/get-status",
            {
              params: {
                orderId: checkoutSdkOrderId,
                appId: miniAppId,
                mac,
              },
            }
          );
          if (data.returnCode) {
            order.info.paymentStatus =
              data.returnCode === 1 ? "success" : "failed";
            db.write();
          }
        }
      }, 20 * 60 * 1000);
      res.json({ message: "Đã liên kết đơn hàng thành công!" });
    }
  })
  .post("/callback", async (req, res) => {
    try {
      const { data, overallMac } = req.body;
      const { orderId, resultCode, extradata } = data;
      // Tạo MAC
      const dataOverallMac = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join("&");
      const validOverallMac = createHmac(
        "sha256",
        process.env.CHECKOUT_SDK_PRIVATE_KEY!
      )
        .update(dataOverallMac)
        .digest("hex");
      if (overallMac === validOverallMac) {
        // Lưu ý 1. Cách lấy `myOrderId`
        const { myOrderId } = JSON.parse(decodeURIComponent(extradata));
        const order = db.data.orders.find((order) => order.id === myOrderId);
        if (order) {
          order.info.paymentStatus = resultCode === 1 ? "success" : "failed";
          db.write();
          // Lưu ý 2. Cách trả về kết quả
          res.json({
            returnCode: 1,
            returnMessage: "Đã cập nhật trạng thái đơn hàng thành công!",
          });
        } else {
          throw Error("Không tìm thấy đơn hàng");
        }
      } else {
        throw Error("MAC không hợp lệ");
      }
    } catch (error) {
      res.json({
        returnCode: 0,
        returnMessage: String(error),
      });
    }
  })
  .listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
