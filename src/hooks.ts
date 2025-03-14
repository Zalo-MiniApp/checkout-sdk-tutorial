import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { MutableRefObject, useLayoutEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { UIMatch, useMatches, useNavigate } from "react-router-dom";
import {
  cartState,
  cartTotalState,
  userInfoKeyState,
  userInfoState,
} from "@/state";
import { CreateOrderReponse, CreateOrderRequest, Product } from "@/types";
import { getConfig } from "@/utils/template";
import { authorize, createOrder, openChat } from "zmp-sdk";
import { useAtomCallback } from "jotai/utils";
import { requestWithPost } from "./utils/request";

export function useRealHeight(
  element: MutableRefObject<HTMLDivElement | null>,
  defaultValue?: number
) {
  const [height, setHeight] = useState(defaultValue ?? 0);
  useLayoutEffect(() => {
    if (element.current && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const [{ contentRect }] = entries;
        setHeight(contentRect.height);
      });
      ro.observe(element.current);
      return () => ro.disconnect();
    }
    return () => {};
  }, [element.current]);

  if (typeof ResizeObserver === "undefined") {
    return -1;
  }
  return height;
}

export function useRequestInformation() {
  const hasUserInfo = useAtomCallback(async (get) => {
    const userInfo = await get(userInfoState);
    return !!userInfo;
  });
  const setInfoKey = useSetAtom(userInfoKeyState);
  const refreshPermissions = () => setInfoKey((key) => key + 1);

  return async () => {
    const hadUserInfo = await hasUserInfo();
    if (!hadUserInfo) {
      await authorize({
        scopes: ["scope.userInfo", "scope.userPhonenumber"],
      }).then(refreshPermissions);
    }
  };
}

export function useAddToCart(product: Product) {
  const [cart, setCart] = useAtom(cartState);

  const currentCartItem = useMemo(
    () => cart.find((item) => item.product.id === product.id),
    [cart, product.id]
  );

  const addToCart = (
    quantity: number | ((oldQuantity: number) => number),
    options?: { toast: boolean }
  ) => {
    setCart((cart) => {
      const newQuantity =
        typeof quantity === "function"
          ? quantity(currentCartItem?.quantity ?? 0)
          : quantity;
      if (newQuantity <= 0) {
        cart.splice(cart.indexOf(currentCartItem!), 1);
      } else {
        if (currentCartItem) {
          currentCartItem.quantity = newQuantity;
        } else {
          cart.push({
            product,
            quantity: newQuantity,
          });
        }
      }
      return [...cart];
    });
    if (options?.toast) {
      toast.success("Đã thêm vào giỏ hàng");
    }
  };

  return { addToCart, cartQuantity: currentCartItem?.quantity ?? 0 };
}

export function useCustomerSupport() {
  return () =>
    openChat({
      type: "oa",
      id: getConfig((config) => config.template.oaIDtoOpenChat),
    });
}

export function useToBeImplemented() {
  return () =>
    toast("Chức năng dành cho các bên tích hợp phát triển...", {
      icon: "🛠️",
    });
}

export function useCheckout() {
  const userInfo = useAtomValue(userInfoState);
  const requestInfo = useRequestInformation();
  const { totalAmount } = useAtomValue(cartTotalState);
  const [cart, setCart] = useAtom(cartState);
  const navigate = useNavigate();

  return async () => {
    try {
      await requestInfo();
      // 1. Tạo đơn hàng ở phía hệ thống của bạn
      const { orderId: myOrderId } = await requestWithPost<
        CreateOrderRequest,
        CreateOrderReponse
      >("/orders", {
        zaloUserId: userInfo.id,
        items: cart,
        total: totalAmount,
      });

      // Chuẩn bị params để tạo MAC
      const amount = totalAmount;
      const desc = `Thanh toán cho đơn hàng #${myOrderId}`;
      const item = cart.map<{ id: number; amount: number }>((cartItem) => ({
        id: cartItem.product.id,
        amount: cartItem.product.price * cartItem.quantity,
      }));
      const extradata = JSON.stringify({
        myOrderId, // truyền theo định danh của đơn hàng đã được tạo ở phía hệ thống của bạn
      });
      const method = JSON.stringify({
        id: "ZALOPAY_SANDBOX", // Phương thức thanh toán
        isCustom: false, // false: Phương thức thanh toán của Platform, true: Phương thức thanh toán riêng của đối tác
      });

      // Gọi đến backend để tạo `MAC`
      const payload = { amount, desc, item, extradata, method };
      const { mac } = await requestWithPost<typeof payload, { mac: string }>(
        "/mac",
        payload
      );

      // 2. Kích hoạt giao dịch thanh toán
      const { orderId: checkoutSdkOrderId } = await createOrder({
        desc,
        item,
        amount: totalAmount,
        extradata,
        method,
        mac,
      });

      // 3. Liên kết đơn hàng với giao dịch
      await requestWithPost("/link", {
        orderId: myOrderId,
        checkoutSdkOrderId,
        miniAppId: window.APP_ID,
      });

      setCart([]);
      navigate("/orders", {
        viewTransition: true,
      });
      toast.success("Thanh toán thành công. Cảm ơn bạn đã mua hàng!", {
        icon: "🎉",
        duration: 5000,
      });
    } catch (error) {
      console.warn(error);
      toast.error(
        "Thanh toán thất bại. Vui lòng kiểm tra nội dung lỗi bên trong Console."
      );
    }
  };
}

export function useRouteHandle() {
  const matches = useMatches() as UIMatch<
    undefined,
    | {
        title?: string | Function;
        logo?: boolean;
        search?: boolean;
        noFooter?: boolean;
        noBack?: boolean;
        noFloatingCart?: boolean;
        scrollRestoration?: number;
      }
    | undefined
  >[];
  const lastMatch = matches[matches.length - 1];

  return [lastMatch.handle, lastMatch, matches] as const;
}
