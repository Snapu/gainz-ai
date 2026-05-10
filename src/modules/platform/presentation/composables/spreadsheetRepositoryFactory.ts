import type { GoogleSpreadsheet } from "google-spreadsheet";
import { useSpreadsheetStore } from "../stores/spreadsheetStore";

export function useSpreadsheetRepositoryFactory<TRepository>(
  factory: (doc: GoogleSpreadsheet) => TRepository,
) {
  const spreadsheetStore = useSpreadsheetStore();

  function getDoc(docOverride?: GoogleSpreadsheet): GoogleSpreadsheet | null {
    return docOverride ?? spreadsheetStore.doc;
  }

  function createRepository(docOverride?: GoogleSpreadsheet): TRepository | null {
    const doc = getDoc(docOverride);
    if (!doc) return null;
    return factory(doc);
  }

  return { spreadsheetStore, getDoc, createRepository };
}
