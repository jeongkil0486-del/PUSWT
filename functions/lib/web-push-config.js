import { HttpsError } from "firebase-functions/v2/https";
import {
    WebPushInputError,
    normalizeVapidKeys,
    normalizeVapidPublicKey
} from "./web-push.js";

function asHttpsError(error) {
    if (error instanceof WebPushInputError) {
        return new HttpsError(error.code, error.message);
    }
    return new HttpsError(
        "failed-precondition",
        "Web Push VAPID configuration is invalid."
    );
}

export function readWebPushPublicKey(publicValue) {
    try {
        return normalizeVapidPublicKey(publicValue);
    } catch (error) {
        throw asHttpsError(error);
    }
}

export function applyWebPushConfiguration({
    publicValue,
    privateValue,
    subject,
    setVapidDetails
}) {
    try {
        const { publicKey, privateKey } = normalizeVapidKeys(publicValue, privateValue);
        setVapidDetails(subject, publicKey, privateKey);
    } catch (error) {
        throw asHttpsError(error);
    }
}

export function asWebPushTestConfigurationError(error) {
    if (error instanceof HttpsError && error.code === "failed-precondition") {
        return new HttpsError(
            "failed-precondition",
            "아이폰 알림 서버 설정을 확인해주세요."
        );
    }
    return error;
}
