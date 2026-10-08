import { requireOptionalNativeModule } from "expo";

export type SelectionSnapshot =
  | { selectionId: string; status: "missing" | "pending" | "cancelled" | "discarded" | "acknowledged" }
  | { selectionId: string; status: "failed"; code: string }
  | { selectionId: string; status: "ready"; resultId: string; photos: { id: string; dataUrl: string }[] };

export type SelectionChanged = { selectionId: string; status: SelectionSnapshot["status"] };
export interface IdentifiedPhotoPickerModule {
  readonly protocolVersion: 1;
  startSelectionAsync(selectionId: string, options: { maxAssets: number; remainingBytes: number }): Promise<SelectionSnapshot>;
  readSelectionAsync(selectionId: string): Promise<SelectionSnapshot>;
  acknowledgeSelectionAsync(selectionId: string, resultId: string): Promise<SelectionSnapshot>;
  discardSelectionAsync(selectionId: string): Promise<SelectionSnapshot>;
  addListener(event: "onSelectionChanged", listener: (event: SelectionChanged) => void): { remove(): void };
}

// Absence is explicit. The caller must not launch Expo's anonymous Android picker.
export default requireOptionalNativeModule<IdentifiedPhotoPickerModule>("QrguitarPhotoPicker");
