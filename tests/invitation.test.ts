/**
 * L'INVITATION D'UN AMI — le routage du serveur de salons (`server/invitation.ts`).
 *
 * Le serveur n'a pas de base : il remet une invitation à la socket qui a
 * annoncé le code d'ami visé. Ce fichier tient les refus (code invalide, soi,
 * hors salon, trop vite), l'ami absent, l'ami en partie, et deux onglets du
 * même ami dont un seul est libre.
 */
import { describe, expect, it } from "vitest";
import { INVITE_INTERVALLE_MS, routeInvitation } from "../server/invitation";
import type { Joignable } from "../server/invitation";

const MOI = { id: "moi", codeAmi: "AAAAAA", salon: "BCDF", derniereInvite: -Infinity };
const T = 1_000_000;
const lea: Joignable = { id: "lea", codeAmi: "PAMPAM", enPartie: false };

describe("le routage d'une invitation", () => {
  it("remet l'invitation à la socket qui porte le code", () => {
    expect(routeInvitation(MOI, "PAMPAM", [lea], T)).toEqual({ livre: true, a: "lea" });
  });

  it("lit un code tapé comme un humain le tape", () => {
    expect(routeInvitation(MOI, "pam-pam", [lea], T)).toEqual({ livre: true, a: "lea" });
  });

  it("refuse un code invalide, son propre code, et hors d'un salon", () => {
    expect(routeInvitation(MOI, 42, [lea], T)).toEqual({ livre: false, pourquoi: "code" });
    expect(routeInvitation(MOI, "AAAAAA", [lea, { id: "x", codeAmi: "AAAAAA", enPartie: false }], T)).toEqual({ livre: false, pourquoi: "soi" });
    expect(routeInvitation({ ...MOI, salon: null }, "PAMPAM", [lea], T)).toEqual({ livre: false, pourquoi: "salon" });
  });

  it("dit ABSENT quand personne ne porte le code, et OCCUPÉ quand l'ami joue", () => {
    expect(routeInvitation(MOI, "PAMPAM", [], T)).toEqual({ livre: false, pourquoi: "absent" });
    expect(routeInvitation(MOI, "PAMPAM", [{ ...lea, enPartie: true }], T)).toEqual({ livre: false, pourquoi: "occupe" });
  });

  it("deux onglets du même ami : le libre reçoit, l'occupé ne bloque pas", () => {
    const occupe = { id: "lea-1", codeAmi: "PAMPAM", enPartie: true };
    const libre = { id: "lea-2", codeAmi: "PAMPAM", enPartie: false };
    expect(routeInvitation(MOI, "PAMPAM", [occupe, libre], T)).toEqual({ livre: true, a: "lea-2" });
  });

  it("ne se remet jamais à soi-même, même si sa socket porte le code visé", () => {
    const moiAussi = { id: "moi", codeAmi: "PAMPAM", enPartie: false };
    expect(routeInvitation({ ...MOI, codeAmi: null }, "PAMPAM", [moiAussi], T)).toEqual({ livre: false, pourquoi: "absent" });
  });

  it("borne le débit : une invitation par intervalle", () => {
    const juste = { ...MOI, derniereInvite: T - INVITE_INTERVALLE_MS + 1 };
    expect(routeInvitation(juste, "PAMPAM", [lea], T)).toEqual({ livre: false, pourquoi: "trop_vite" });
    const apres = { ...MOI, derniereInvite: T - INVITE_INTERVALLE_MS };
    expect(routeInvitation(apres, "PAMPAM", [lea], T)).toEqual({ livre: true, a: "lea" });
  });
});
