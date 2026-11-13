/* Dar3a Store — minimal WebAuthn browser helpers (platform biometrics/passkeys) */
(function () {
    'use strict';

    function base64urlToBuffer(value) {
        const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        const binary = atob(padded);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }

    function bufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function registrationOptions(options) {
        return {
            ...options,
            challenge: base64urlToBuffer(options.challenge),
            user: { ...options.user, id: base64urlToBuffer(options.user.id) },
            excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
                ...credential,
                id: base64urlToBuffer(credential.id)
            }))
        };
    }

    function authenticationOptions(options) {
        return {
            ...options,
            challenge: base64urlToBuffer(options.challenge),
            allowCredentials: (options.allowCredentials || []).map((credential) => ({
                ...credential,
                id: base64urlToBuffer(credential.id)
            }))
        };
    }

    function credentialToJSON(credential) {
        const response = credential.response;
        const base = {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {}
        };
        if (response.attestationObject) {
            return {
                ...base,
                response: {
                    clientDataJSON: bufferToBase64url(response.clientDataJSON),
                    attestationObject: bufferToBase64url(response.attestationObject),
                    transports: typeof response.getTransports === 'function' ? response.getTransports() : []
                }
            };
        }
        return {
            ...base,
            response: {
                clientDataJSON: bufferToBase64url(response.clientDataJSON),
                authenticatorData: bufferToBase64url(response.authenticatorData),
                signature: bufferToBase64url(response.signature),
                userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined
            }
        };
    }

    async function supported() {
        if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return false;
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
        return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }

    window.Dar3aWebAuthn = {
        supported,
        async create(options) {
            const credential = await navigator.credentials.create({ publicKey: registrationOptions(options) });
            if (!credential) throw new Error('لم يتم إنشاء مفتاح البصمة.');
            return credentialToJSON(credential);
        },
        async get(options) {
            const credential = await navigator.credentials.get({ publicKey: authenticationOptions(options) });
            if (!credential) throw new Error('لم يتم التحقق من بصمة الجهاز.');
            return credentialToJSON(credential);
        }
    };
}());
