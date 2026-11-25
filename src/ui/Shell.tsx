import { Heat } from "./play/Heat";
import { Band } from "./play/Band";
import { Head } from "./play/Head";
import { Stage } from "./play/Stage";
import { Drama } from "./play/Drama";
import { Gout } from "./play/Gout";
import { LiveHud, Feed } from "./play/LiveHud";
import { Foot, Tier, Stamp } from "./play/Foot";
import { Chat } from "./play/Chat";
import { Notice } from "./play/Notice";
import { Home } from "./screens/Home";
import { Niveau } from "./screens/Niveau";
import { Boutique } from "./screens/Boutique";
import { Solo } from "./screens/Solo";
import { Fiche } from "./screens/Fiche";
import { Brief } from "./screens/Brief";
import { Over } from "./screens/Over";
import { Codex } from "./screens/Codex";
import { Nav } from "./chrome/Nav";
import { Topbar } from "./chrome/Topbar";
import { Reglages } from "./screens/Reglages";
import { Classement } from "./screens/Classement";
import { Amis } from "./screens/Amis";
import { Compte } from "./screens/Compte";
import { MultiId } from "./screens/MultiId";
import { MultiJoin } from "./screens/MultiJoin";
import { MultiLobby } from "./screens/MultiLobby";
import { MultiEnd } from "./screens/MultiEnd";
import { InvitationAmi, Micro, Toast, Pastille } from "./chrome/Overlays";

/**
 * Le contenu de `#app`, dans l'ordre exact de l'ancien `index.html`.
 *
 * L'ordre compte : plusieurs tests (et la CSS) s'appuient sur la position
 * relative des blocs — le canvas avant les surcouches, la barre de HUD avant le
 * pied, etc. `#app` lui-même reste dans `index.html` : le DOM final est le même
 * qu'avant, sans élément enveloppant.
 */
export function Shell() {
  return (
    <>
      <Heat />
      <Band />
      <Head />
      <Stage />
      <Drama />
      <Gout />
      <LiveHud />
      <Feed />
      <Foot />
      <Tier />
      <Stamp />
      <Chat />
      <Notice />
      <Home />
      <Niveau />
      <Boutique />
      <Solo />
      <Fiche />
      <Brief />
      <Over />
      <Codex />
      <Nav />
      <Topbar />
      <Reglages />
      <Classement />
      <Amis />
      <Compte />
      <MultiId />
      <MultiJoin />
      <MultiLobby />
      <MultiEnd />
      <Micro />
      <Toast />
      <InvitationAmi />
      <Pastille />
    </>
  );
}
