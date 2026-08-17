/* Derives the list of shelf numbers from objects.json, so you never
   have to keep a separate count in sync. Add an object with
   "shelf": 4 and a fourth shelf appears by itself. */
import objects from "./objects.json" with { type: "json" };

export default [...new Set(objects.map((o) => o.shelf))].sort((a, b) => a - b);
