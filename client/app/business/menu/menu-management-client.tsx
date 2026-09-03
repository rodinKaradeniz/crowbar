"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clientGetMenus,
  clientCreateMenu,
  clientUpdateMenu,
  clientDeleteMenu,
  clientCreateCategory,
  clientUpdateCategory,
  clientDeleteCategory,
  clientCreateMenuItem,
  clientUpdateMenuItem,
  clientSetItemAvailability,
  clientGetPreparationStations,
  clientCreatePreparationStation,
  clientUpdatePreparationStation,
  clientArchivePreparationStation,
  clientDeleteMenuItem,
  clientSaveItemToLibrary,
  clientGetLibrary,
  clientCreateLibraryItem,
  clientUpdateLibraryItem,
  clientDeleteLibraryItem,
  clientAddLibraryItemToCategory,
  clientGetRecipe,
  clientSetRecipe,
  clientGetMenuItemStockFlags,
  clientGetInventoryItems,
  clientGetTaxProfiles,
  clientCreateMenuActivationWindow,
  clientUpdateMenuActivationWindow,
  clientDeleteMenuActivationWindow,
} from "@/lib/client-api";
import type {
  InventoryItem,
  LibraryItem,
  Menu,
  MenuActivationWindow,
  MenuCategory,
  MenuItem,
  MenuItemStockInfo,
  PreparationStation,
  RecipeIngredient,
  TaxProfile,
} from "@/types";
import Link from "next/link";
import { isLiquidUnitType, mlToOz, ozToMl } from "@/lib/units";
import { DAYS_OF_WEEK } from "@/lib/days";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Pencil,
  Trash2,
  ChefHat,
  Package,
  BookMarked,
  PlusCircle,
  Bookmark,
  FlaskConical,
  AlertTriangle,
  Utensils,
  Copy,
  Check,
  ExternalLink,
  Clock,
} from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";
import { PageBody, PageHeader } from "@/components/page-header";

interface Props {
  businessId: string;
  businessSlug: string;
  canManageTax: boolean;
}

type WindowForm = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const emptyWindowForm: WindowForm = {
  daysOfWeek: [],
  startTime: "17:00",
  endTime: "20:00",
  isActive: true,
};

function daysLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  return DAYS_OF_WEEK.filter((d) => days.includes(d.index))
    .map((d) => d.short)
    .join(", ");
}

// The one-line answer to "when is this menu served?" — the summary a manager
// reads without opening anything.
function activationSummary(menu: Menu): string {
  const windows = menu.activationWindows ?? [];
  if (windows.length === 0) return "Always on";
  const live = windows.filter((w) => w.isActive);
  if (live.length === 0) return "Scheduled · no active window";
  if (live.length === 1) {
    return `${daysLabel(live[0].daysOfWeek)} · ${live[0].startTime}–${live[0].endTime}`;
  }
  return `${live.length} windows`;
}

export function MenuManagementClient({ businessId, businessSlug, canManageTax }: Props) {
  const { currencyCode, locale, taxLabel, timezone } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [stations, setStations] = useState<PreparationStation[]>([]);
  const [newStationName, setNewStationName] = useState("");
  const [renamingStationId, setRenamingStationId] = useState<string | null>(null);
  const [renameStationDraft, setRenameStationDraft] = useState("");

  // ── Public QR-menu link (share/copy) ─────────────────────────────────────────
  // The public menu route is keyed by slug (/menu/[slug]); build the absolute URL
  // client-side so it's shareable. Reuses the clipboard pattern from the widget
  // snippet page (navigator.clipboard + execCommand fallback).
  const [menuLinkCopied, setMenuLinkCopied] = useState(false);
  const [publicMenuUrl, setPublicMenuUrl] = useState(`/menu/${businessSlug}`);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicMenuUrl(`${window.location.origin}/menu/${businessSlug}`);
    }
  }, [businessSlug]);

  async function handleCopyMenuLink() {
    try {
      await navigator.clipboard.writeText(publicMenuUrl);
    } catch {
      const el = document.createElement("textarea");
      el.value = publicMenuUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setMenuLinkCopied(true);
    setTimeout(() => setMenuLinkCopied(false), 2000);
  }

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [menuDialog, setMenuDialog] = useState(false);
  const [activationDialog, setActivationDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState(false);
  const [libraryDialog, setLibraryDialog] = useState(false);
  const [libraryItemDialog, setLibraryItemDialog] = useState(false);

  // ── Confirmation dialog state ────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    type: "menu" | "category" | "item" | "library";
    menuId?: string;
    categoryId?: string;
  } | null>(null);

  // ── Activation window form ──────────────────────────────────────────────────
  // A menu is either always on (no windows) or served only inside them. The
  // schedule used to live on a separate business-wide settings page; it
  // belongs to the menu it governs.
  const [editingWindow, setEditingWindow] = useState<MenuActivationWindow | null>(null);
  const [windowForm, setWindowForm] = useState<WindowForm>(emptyWindowForm);
  const [savingWindow, setSavingWindow] = useState(false);

  // ── Menu form ───────────────────────────────────────────────────────────────
  const [menuName, setMenuName] = useState("");
  const [menuDesc, setMenuDesc] = useState("");
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);

  // ── Category form ───────────────────────────────────────────────────────────
  const [categoryName, setCategoryName] = useState("");
  const [targetMenuId, setTargetMenuId] = useState<string | null>(null);

  // ── Item form ───────────────────────────────────────────────────────────────
  const [itemForm, setItemForm] = useState<ItemFormState>({
    name: "",
    description: "",
    price: "",
    isAlcoholic: false,
    routingDestination: "shared",
    prepTime: "",
    taxProfileId: "",
  });
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // ── Library state ───────────────────────────────────────────────────────────
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryTargetCategoryId, setLibraryTargetCategoryId] = useState<
    string | null
  >(null);
  const [editingLibraryItem, setEditingLibraryItem] =
    useState<LibraryItem | null>(null);
  const [libraryItemForm, setLibraryItemForm] = useState<ItemFormState>({
    name: "",
    description: "",
    price: "",
    isAlcoholic: false,
    routingDestination: "shared",
    prepTime: "",
    taxProfileId: "",
  });

  // ── Recipe editor + low-stock badges ─────────────────────────────────────────
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [stockInfo, setStockInfo] = useState<Map<string, MenuItemStockInfo>>(
    new Map(),
  );

  const selectedMenu = menus.find((m) => m.id === selectedMenuId) ?? null;

  useEffect(() => {
    void loadMenus();
    void loadStockFlags();
    void clientGetTaxProfiles().then(setTaxProfiles).catch(() => {});
    void clientGetPreparationStations().then(setStations).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function loadStockFlags() {
    try {
      const info = await clientGetMenuItemStockFlags(businessId);
      setStockInfo(new Map(info.map((i) => [i.menuItemId, i])));
    } catch {
      // Non-critical (inventory module may be disabled) — leave badges off.
    }
  }

  async function loadMenus() {
    setLoading(true);
    try {
      const data = await clientGetMenus(businessId);
      setMenus(data);
      if (data.length > 0 && !selectedMenuId) {
        setSelectedMenuId(data[0].id);
      }
    } catch {
      toast.error("Failed to load menus");
    } finally {
      setLoading(false);
    }
  }

  async function addStation() {
    if (!newStationName.trim()) return;
    try {
      const station = await clientCreatePreparationStation(newStationName.trim(), stations.length);
      setStations((current) => [...current, station]);
      setNewStationName("");
      toast.success("Preparation station created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the station.");
    }
  }

  async function renameStation(station: PreparationStation) {
    const next = renameStationDraft.trim();
    if (!next || next === station.name) {
      setRenamingStationId(null);
      return;
    }
    try {
      const updated = await clientUpdatePreparationStation(station.id, { name: next });
      setStations((current) =>
        current.map((item) => (item.id === station.id ? updated : item)),
      );
      setRenamingStationId(null);
      toast.success("Station renamed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rename the station.",
      );
    }
  }

  async function archiveStation(station: PreparationStation) {
    try {
      await clientArchivePreparationStation(station.id);
      setStations((current) => current.map((item) => item.id === station.id ? { ...item, isActive: false } : item));
      toast.success(`${station.name} archived.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive the station.");
    }
  }

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const data = await clientGetLibrary(businessId);
      setLibrary(data);
    } catch {
      toast.error("Failed to load library");
    } finally {
      setLibraryLoading(false);
    }
  }

  // ── Menu CRUD ────────────────────────────────────────────────────────────────

  function openCreateMenu() {
    setEditingMenu(null);
    setMenuName("");
    setMenuDesc("");
    setMenuDialog(true);
  }

  function openEditMenu(menu: Menu) {
    setEditingMenu(menu);
    setMenuName(menu.name);
    setMenuDesc(menu.description ?? "");
    setMenuDialog(true);
  }

  async function saveMenu() {
    if (!menuName.trim()) return;
    try {
      if (editingMenu) {
        const updated = await clientUpdateMenu(businessId, editingMenu.id, {
          name: menuName.trim(),
          description: menuDesc.trim() || undefined,
        });
        setMenus((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m)),
        );
      } else {
        const created = await clientCreateMenu(businessId, {
          name: menuName.trim(),
          description: menuDesc.trim() || undefined,
        });
        setMenus((prev) => [...prev, created]);
        setSelectedMenuId(created.id);
      }
      setMenuDialog(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function deleteMenu(menuId: string) {
    const menu = menus.find((m) => m.id === menuId);
    if (!menu) return;
    setDeleteTarget({ id: menuId, name: menu.name, type: "menu" });
  }

  async function confirmDeleteMenu(menuId: string) {
    try {
      await clientDeleteMenu(businessId, menuId);
      const remaining = menus.filter((m) => m.id !== menuId);
      setMenus(remaining);
      if (selectedMenuId === menuId) {
        setSelectedMenuId(remaining[0]?.id ?? null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleMenuActive(menu: Menu) {
    try {
      const updated = await clientUpdateMenu(businessId, menu.id, {
        isActive: !menu.isActive,
      });
      setMenus((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Activation windows ───────────────────────────────────────────────────────

  function setMenuWindows(menuId: string, windows: MenuActivationWindow[]) {
    setMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, activationWindows: windows } : m)),
    );
  }

  function openActivation(menu: Menu) {
    setSelectedMenuId(menu.id);
    setEditingWindow(null);
    setWindowForm(emptyWindowForm);
    setActivationDialog(true);
  }

  function editWindow(w: MenuActivationWindow) {
    setEditingWindow(w);
    setWindowForm({
      daysOfWeek: w.daysOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      isActive: w.isActive,
    });
  }

  function toggleWindowDay(index: number) {
    setWindowForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(index)
        ? f.daysOfWeek.filter((d) => d !== index)
        : [...f.daysOfWeek, index].sort((a, b) => a - b),
    }));
  }

  async function saveWindow() {
    if (!selectedMenu) return;
    if (windowForm.daysOfWeek.length === 0) {
      toast.error("Select at least one day");
      return;
    }
    if (windowForm.startTime === windowForm.endTime) {
      toast.error("Start and end time can't be the same");
      return;
    }
    // start > end is a valid overnight window (it wraps past midnight), so it
    // is deliberately allowed.
    setSavingWindow(true);
    try {
      const existing = selectedMenu.activationWindows ?? [];
      if (editingWindow) {
        const updated = await clientUpdateMenuActivationWindow(
          businessId,
          selectedMenu.id,
          editingWindow.id,
          windowForm,
        );
        setMenuWindows(
          selectedMenu.id,
          existing.map((w) => (w.id === updated.id ? updated : w)),
        );
      } else {
        const created = await clientCreateMenuActivationWindow(
          businessId,
          selectedMenu.id,
          windowForm,
        );
        setMenuWindows(selectedMenu.id, [...existing, created]);
      }
      setEditingWindow(null);
      setWindowForm(emptyWindowForm);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingWindow(false);
    }
  }

  async function removeWindow(w: MenuActivationWindow) {
    if (!selectedMenu) return;
    try {
      await clientDeleteMenuActivationWindow(businessId, selectedMenu.id, w.id);
      setMenuWindows(
        selectedMenu.id,
        (selectedMenu.activationWindows ?? []).filter((x) => x.id !== w.id),
      );
      if (editingWindow?.id === w.id) {
        setEditingWindow(null);
        setWindowForm(emptyWindowForm);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────────

  function openCreateCategory(menuId: string) {
    setCategoryName("");
    setTargetMenuId(menuId);
    setCategoryDialog(true);
  }

  async function saveCategory() {
    if (!categoryName.trim() || !targetMenuId) return;
    try {
      const created = await clientCreateCategory(businessId, targetMenuId, {
        name: categoryName.trim(),
      });
      setMenus((prev) =>
        prev.map((m) =>
          m.id === targetMenuId
            ? { ...m, categories: [...m.categories, { ...created, items: [] }] }
            : m,
        ),
      );
      setCategoryDialog(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // clientUpdateCategory existed from the start and nothing called it, so a
  // category could be created and deleted but never renamed — a typo in a
  // section heading was permanent, and deleting to fix it takes its items with
  // it.
  async function renameCategory(menuId: string, categoryId: string, name: string) {
    const next = name.trim();
    if (!next) return;
    try {
      const updated = await clientUpdateCategory(businessId, categoryId, { name: next });
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menuId
            ? {
                ...m,
                categories: m.categories.map((c) =>
                  c.id === categoryId ? { ...c, name: updated.name } : c,
                ),
              }
            : m,
        ),
      );
      toast.success("Category renamed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rename the category.",
      );
    }
  }

  function deleteCategory(menuId: string, categoryId: string) {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories.find((c) => c.id === categoryId);
    if (!category) return;
    setDeleteTarget({ id: categoryId, name: category.name, type: "category", menuId });
  }

  async function confirmDeleteCategory(menuId: string, categoryId: string) {
    try {
      await clientDeleteCategory(businessId, categoryId);
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menuId
            ? {
                ...m,
                categories: m.categories.filter((c) => c.id !== categoryId),
              }
            : m,
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Item CRUD ─────────────────────────────────────────────────────────────────

  function openCreateItem(categoryId: string) {
    if (!canManageTax) {
      toast.error("Only owners and managers can create priced items and assign their tax profile");
      return;
    }
    setEditingItem(null);
    setItemForm({
      name: "",
      description: "",
      price: "",
      isAlcoholic: false,
      routingDestination: stations[0]?.id ?? "shared",
      prepTime: "",
      taxProfileId: taxProfiles.find((profile) => profile.isActive && profile.code === "STANDARD")?.id ?? taxProfiles.find((profile) => profile.isActive)?.id ?? "",
    });
    setTargetCategoryId(categoryId);
    setItemDialog(true);
  }

  function openEditItem(item: MenuItem, categoryId: string) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      isAlcoholic: item.isAlcoholic ?? false,
      routingDestination: item.routesToAllStations ? "shared" : (item.preparationStationId ?? "shared"),
      prepTime: item.prepTimeMinutes ? String(item.prepTimeMinutes) : "",
      taxProfileId: item.taxProfileId,
    });
    setTargetCategoryId(categoryId);
    setItemDialog(true);
  }

  async function saveItem() {
    if (!itemForm.name.trim() || !targetCategoryId) return;
    const price = parseFloat(itemForm.price);
    if (isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    try {
      if (editingItem) {
        const updated = await clientUpdateMenuItem(businessId, editingItem.id, {
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || undefined,
          price,
            isAlcoholic: itemForm.isAlcoholic,
          preparationStationId: itemForm.routingDestination === "shared" ? null : itemForm.routingDestination,
          routesToAllStations: itemForm.routingDestination === "shared",
          prepTimeMinutes: itemForm.prepTime
            ? parseInt(itemForm.prepTime)
            : undefined,
          taxProfileId: canManageTax ? itemForm.taxProfileId || undefined : undefined,
        });
        updateItemInState(updated, targetCategoryId);
      } else {
        const created = await clientCreateMenuItem(
          businessId,
          targetCategoryId,
          {
            name: itemForm.name.trim(),
            description: itemForm.description.trim() || undefined,
            price,
                isAlcoholic: itemForm.isAlcoholic,
            preparationStationId: itemForm.routingDestination === "shared" ? undefined : itemForm.routingDestination,
            routesToAllStations: itemForm.routingDestination === "shared",
            prepTimeMinutes: itemForm.prepTime
              ? parseInt(itemForm.prepTime)
              : undefined,
            taxProfileId: canManageTax ? itemForm.taxProfileId || undefined : undefined,
          },
        );
        addItemToCategory(created, targetCategoryId);
      }
      setItemDialog(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleAvailability(item: MenuItem, categoryId: string) {
    try {
      const updated = await clientSetItemAvailability(
        businessId,
        item.id,
        !item.isAvailable,
        item.isAvailable ? "Manually marked 86" : "Manually restored by staff",
      );
      updateItemInState(updated, categoryId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteItem(
    item: MenuItem,
    menuId: string,
    categoryId: string,
  ) {
    try {
      await clientDeleteMenuItem(businessId, item.id);
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menuId
            ? {
                ...m,
                categories: m.categories.map((c) =>
                  c.id === categoryId
                    ? { ...c, items: c.items.filter((i) => i.id !== item.id) }
                    : c,
                ),
              }
            : m,
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveToLibrary(item: MenuItem) {
    try {
      await clientSaveItemToLibrary(businessId, item.id);
      toast.success(`"${item.name}" saved to library`);
      // Reload library if it's open
      if (library.length > 0) void loadLibrary();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function updateItemInState(updated: MenuItem, categoryId: string) {
    setMenus((prev) =>
      prev.map((m) => ({
        ...m,
        categories: m.categories.map((c) =>
          c.id === categoryId
            ? {
                ...c,
                items: c.items.map((i) => (i.id === updated.id ? updated : i)),
              }
            : c,
        ),
      })),
    );
  }

  function addItemToCategory(item: MenuItem, categoryId: string) {
    setMenus((prev) =>
      prev.map((m) => ({
        ...m,
        categories: m.categories.map((c) =>
          c.id === categoryId ? { ...c, items: [...c.items, item] } : c,
        ),
      })),
    );
  }

  // ── Library panel ─────────────────────────────────────────────────────────────

  function openLibraryForCategory(categoryId: string) {
    setLibraryTargetCategoryId(categoryId);
    void loadLibrary();
    setLibraryDialog(true);
  }

  async function addFromLibrary(libItem: LibraryItem) {
    if (!libraryTargetCategoryId) return;
    try {
      const created = await clientAddLibraryItemToCategory(
        businessId,
        libItem.id,
        libraryTargetCategoryId,
      );
      addItemToCategory(created, libraryTargetCategoryId);
      toast.success(`"${libItem.name}" added to category`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function openCreateLibraryItem() {
    if (!canManageTax) {
      toast.error("Only owners and managers can create priced items and assign their tax profile");
      return;
    }
    setEditingLibraryItem(null);
    setLibraryItemForm({
      name: "",
      description: "",
      price: "",
      isAlcoholic: false,
      routingDestination: stations[0]?.id ?? "shared",
      prepTime: "",
      taxProfileId: taxProfiles.find((profile) => profile.isActive && profile.code === "STANDARD")?.id ?? taxProfiles.find((profile) => profile.isActive)?.id ?? "",
    });
    setLibraryItemDialog(true);
  }

  function openEditLibraryItem(item: LibraryItem) {
    setEditingLibraryItem(item);
    setLibraryItemForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      isAlcoholic: false,
      routingDestination: item.routesToAllStations ? "shared" : (item.preparationStationId ?? "shared"),
      prepTime: item.prepTimeMinutes ? String(item.prepTimeMinutes) : "",
      taxProfileId: item.taxProfileId,
    });
    setLibraryItemDialog(true);
  }

  async function saveLibraryItem() {
    if (!libraryItemForm.name.trim()) return;
    const price = parseFloat(libraryItemForm.price);
    if (isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    try {
      if (editingLibraryItem) {
        const updated = await clientUpdateLibraryItem(
          businessId,
          editingLibraryItem.id,
          {
            name: libraryItemForm.name.trim(),
            description: libraryItemForm.description.trim() || undefined,
            price,
            preparationStationId: libraryItemForm.routingDestination === "shared" ? null : libraryItemForm.routingDestination,
            routesToAllStations: libraryItemForm.routingDestination === "shared",
            prepTimeMinutes: libraryItemForm.prepTime
              ? parseInt(libraryItemForm.prepTime)
              : undefined,
            taxProfileId: canManageTax ? libraryItemForm.taxProfileId || undefined : undefined,
          },
        );
        setLibrary((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i)),
        );
      } else {
        const created = await clientCreateLibraryItem(businessId, {
          name: libraryItemForm.name.trim(),
          description: libraryItemForm.description.trim() || undefined,
          price,
          preparationStationId: libraryItemForm.routingDestination === "shared" ? undefined : libraryItemForm.routingDestination,
          routesToAllStations: libraryItemForm.routingDestination === "shared",
          prepTimeMinutes: libraryItemForm.prepTime
            ? parseInt(libraryItemForm.prepTime)
            : undefined,
          taxProfileId: canManageTax ? libraryItemForm.taxProfileId || undefined : undefined,
        });
        setLibrary((prev) => [...prev, created]);
      }
      setLibraryItemDialog(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteLibraryItem(item: LibraryItem) {
    try {
      await clientDeleteLibraryItem(businessId, item.id);
      setLibrary((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <SkeletonList rows={5} columns={["w-[34%]", "w-[18%]", "w-[16%]", "w-[12%]"]} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Menu Management"
        description="Create menus, categories, and items for your ordering board."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void loadLibrary();
                setLibraryTargetCategoryId(null);
                setLibraryDialog(true);
              }}
            >
              <BookMarked className="h-4 w-4 mr-2" />
              Library
            </Button>
            <Button onClick={openCreateMenu}>
              <Plus className="h-4 w-4 mr-2" />
              New Menu
            </Button>
          </>
        }
      />

      <PageBody>
        {/* Public QR-menu link — the URL customers scan/open to order */}
        <div className="flex items-center justify-between gap-3 border bg-card p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Public menu link</p>
            <p className="text-xs text-muted-foreground truncate">
              {publicMenuUrl}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="filter" variant="secondary" onClick={handleCopyMenuLink}>
              {menuLinkCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy link
                </>
              )}
            </Button>
            <Link href={`/menu/${businessSlug}`} target="_blank">
              <Button size="filter" variant="secondary">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
              </Button>
            </Link>
          </div>
        </div>

        <section className="border bg-card p-4 space-y-3">
          <div><p className="font-medium">Preparation stations</p><p className="text-xs text-muted-foreground">Items route to one station or the shared queue.</p></div>
          <div className="flex flex-wrap gap-2">
            {stations.filter((station) => station.isActive).map((station) => (
              <div key={station.id} className="inline-flex items-center gap-[var(--space-8)] rounded-[var(--radius-3)] border border-border px-3 py-2 text-[length:var(--ui-size)]">
                {renamingStationId === station.id ? (
                  <>
                    <Input
                      autoFocus
                      value={renameStationDraft}
                      onChange={(event) => setRenameStationDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void renameStation(station);
                        if (event.key === "Escape") setRenamingStationId(null);
                      }}
                      className="h-[var(--control-desktop)] w-40"
                      aria-label={`Rename ${station.name}`}
                    />
                    <Button size="filter" variant="secondary" onClick={() => void renameStation(station)}>
                      Save
                    </Button>
                    <Button size="filter" variant="ghost" onClick={() => setRenamingStationId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span>{station.name}</span>
                    {canManageTax && (
                      <>
                        <button
                          type="button"
                          className="type-label text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setRenamingStationId(station.id);
                            setRenameStationDraft(station.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="type-label text-muted-foreground hover:text-critical-text"
                          onClick={() => void archiveStation(station)}
                        >
                          Archive
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            {stations.filter((station) => station.isActive).length === 0 && <p className="text-sm text-muted-foreground">No active station. Items can still use the shared queue.</p>}
          </div>
          {canManageTax && <div className="flex max-w-sm gap-2"><Input placeholder="New station name" value={newStationName} onChange={(event) => setNewStationName(event.target.value)} /><Button variant="secondary" onClick={() => void addStation()} disabled={!newStationName.trim()}>Add station</Button></div>}
        </section>

        {menus.length === 0 ? (
          <EmptyState
            icon={ChefHat}
            title="No menus yet"
            description="Create your first menu to get started."
            action={{ label: "Create Menu", onClick: openCreateMenu }}
          />
        ) : (
          <>
            {/* Menu tabs */}
            <div className="flex gap-2 flex-wrap">
              {menus.map((menu) => (
                <button
                  key={menu.id}
                  onClick={() => setSelectedMenuId(menu.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    selectedMenuId === menu.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {menu.name}
                  {!menu.isActive && (
                    <span className="ml-1.5 text-xs opacity-60">(inactive)</span>
                  )}
                </button>
              ))}
            </div>

            {selectedMenu && (
              <div className="space-y-4">
                {/* Menu header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{selectedMenu.name}</p>
                    {selectedMenu.description && (
                      <p className="text-sm text-muted-foreground">
                        {selectedMenu.description}
                      </p>
                    )}
                    {/* When this menu is served. Guests never see a menu
                        outside its window, and an order from one is refused. */}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden />
                      {activationSummary(selectedMenu)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageTax && (
                      <Button
                        variant="secondary"
                        size="filter"
                        onClick={() => openActivation(selectedMenu)}
                      >
                        Activation
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="filter"
                      onClick={() => toggleMenuActive(selectedMenu)}
                    >
                      {selectedMenu.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="filter"
                      onClick={() => openEditMenu(selectedMenu)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="filter"
                      onClick={() => deleteMenu(selectedMenu.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="filter"
                      onClick={() => openCreateCategory(selectedMenu.id)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Category
                    </Button>
                  </div>
                </div>

                {/* Categories and items */}
                {selectedMenu.categories.length === 0 ? (
                  <div className="border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No categories yet.{" "}
                      <button
                        className="underline"
                        onClick={() => openCreateCategory(selectedMenu.id)}
                      >
                        Add one
                      </button>
                    </p>
                  </div>
                ) : (
                  selectedMenu.categories.map((cat) => (
                    <CategorySection
                      key={cat.id}
                      menu={selectedMenu}
                      category={cat}
                      stockInfo={stockInfo}
                      stations={stations}
                      onAddItem={openCreateItem}
                      onAddFromLibrary={openLibraryForCategory}
                      onEditItem={openEditItem}
                      onToggleAvail={toggleAvailability}
                      onDeleteItem={(item, menuId, categoryId) =>
                        setDeleteTarget({
                          id: item.id,
                          name: item.name,
                          type: "item",
                          menuId,
                          categoryId,
                        })
                      }
                      onDeleteCategory={deleteCategory}
                      onRenameCategory={renameCategory}
                      onSaveToLibrary={saveToLibrary}
                      onEditRecipe={setRecipeItem}
                      canCreateItems={canManageTax}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* ── Activation dialog ─────────────────────────────────────────────────
             A menu with no windows is always on. Adding one narrows it to those
             days and hours, in the venue's own timezone. Kept plain: this is a
             settings control on an already crowded page. */}
        <Dialog open={activationDialog} onOpenChange={setActivationDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {selectedMenu ? `${selectedMenu.name} · activation` : "Activation"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {(selectedMenu?.activationWindows ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This menu is <span className="font-medium text-foreground">always on</span>.
                  Add a window to serve it only on certain days and hours.
                </p>
              ) : (
                <div className="space-y-2">
                  {(selectedMenu?.activationWindows ?? []).map((w) => (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border px-4 py-3"
                    >
                      <div className="flex-1 min-w-[var(--row-content-min)]">
                        <p className="text-sm font-medium">
                          {daysLabel(w.daysOfWeek)}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          {w.startTime}–{w.endTime}
                          {w.startTime > w.endTime && " (overnight)"}
                        </p>
                      </div>
                      {!w.isActive && <Badge tone="neutral">Inactive</Badge>}
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="filter"
                          onClick={() => editWindow(w)}
                          aria-label="Edit window"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="filter"
                          onClick={() => removeWindow(w)}
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete window"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4 border-t pt-4">
                <p className="type-label text-muted-foreground">
                  {editingWindow ? "Edit window" : "Add a window"}
                </p>
                <div className="space-y-1.5">
                  <Label>Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((d) => {
                      const on = windowForm.daysOfWeek.includes(d.index);
                      return (
                        <button
                          key={d.index}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleWindowDay(d.index)}
                          className={`h-[var(--control-desktop-min)] min-w-[var(--control-desktop-min)] rounded-[var(--radius-2)] border px-3 text-sm transition-colors ${
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-muted-foreground/40"
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="window-start">Start</Label>
                    <Input
                      id="window-start"
                      type="time"
                      value={windowForm.startTime}
                      onChange={(e) =>
                        setWindowForm((f) => ({ ...f, startTime: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="window-end">End</Label>
                    <Input
                      id="window-end"
                      type="time"
                      value={windowForm.endTime}
                      onChange={(e) =>
                        setWindowForm((f) => ({ ...f, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Times are in {timezone}. An end time earlier than the start
                  runs past midnight into the next morning.
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="window-active"
                    checked={windowForm.isActive}
                    onCheckedChange={(v) =>
                      setWindowForm((f) => ({ ...f, isActive: v === true }))
                    }
                  />
                  <Label htmlFor="window-active" className="font-normal">
                    Window is in use
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              {editingWindow && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingWindow(null);
                    setWindowForm(emptyWindowForm);
                  }}
                >
                  Cancel edit
                </Button>
              )}
              <Button variant="secondary" onClick={() => setActivationDialog(false)}>
                Done
              </Button>
              <Button onClick={saveWindow} disabled={savingWindow}>
                {editingWindow ? "Save window" : "Add window"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Menu dialog ──────────────────────────────────────────────────────── */}
        <Dialog open={menuDialog} onOpenChange={setMenuDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingMenu ? "Edit Menu" : "New Menu"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="Dinner Menu"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea
                  value={menuDesc}
                  onChange={(e) => setMenuDesc(e.target.value)}
                  placeholder="Available from 6pm–11pm"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setMenuDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveMenu} disabled={!menuName.trim()}>
                {editingMenu ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Category dialog ───────────────────────────────────────────────────── */}
        <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label>Name</Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Starters"
              />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCategoryDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCategory} disabled={!categoryName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Item dialog ───────────────────────────────────────────────────────── */}
        <Dialog open={itemDialog} onOpenChange={setItemDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Item" : "New Item"}</DialogTitle>
            </DialogHeader>
            <ItemFormFields form={itemForm} onChange={setItemForm} showAlcohol taxProfiles={taxProfiles} canManageTax={canManageTax} currencyCode={currencyCode} taxLabel={taxLabel} stations={stations} />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setItemDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={saveItem}
                disabled={!itemForm.name.trim() || !itemForm.price || (!editingItem && !itemForm.taxProfileId)}
              >
                {editingItem ? "Save" : "Add Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Library sheet ─────────────────────────────────────────────────────── */}
        <Sheet open={libraryDialog} onOpenChange={setLibraryDialog}>
          <SheetContent className="w-[400px] sm:max-w-[400px] flex flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BookMarked className="h-4 w-4" />
                Item Library
              </SheetTitle>
            </SheetHeader>

            <div className="flex items-center justify-between px-4 pt-1 pb-3 border-b">
              <p className="text-xs text-muted-foreground">
                {libraryTargetCategoryId
                  ? "Click + to add an item to the selected category."
                  : "Manage reusable item templates."}
              </p>
              {canManageTax && <Button size="filter" variant="secondary" onClick={openCreateLibraryItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                New
              </Button>}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {libraryLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Loading…
                </p>
              ) : library.length === 0 ? (
                <div className="border border-dashed p-8 text-center mt-2">
                  <BookMarked className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No library items yet.
                  </p>
                  {canManageTax && <Button
                    size="filter"
                    className="mt-3"
                    onClick={openCreateLibraryItem}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add first item
                  </Button>}
                </div>
              ) : (
                library.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 border px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {item.name}
                        </span>
                        <Badge
                          tone="neutral"
                          className="text-xs flex items-center gap-1 h-4 shrink-0"
                        >
                          {item.routesToAllStations ? "Shared" : (stations.find((station) => station.id === item.preparationStationId)?.name ?? "Archived station")}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                      <p className="text-sm font-semibold mt-1">
                        {money(item.price)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {libraryTargetCategoryId && (
                        <Button
                          size="filter"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-primary hover:text-primary"
                          title="Add to category"
                          onClick={() => addFromLibrary(item)}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="filter"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => openEditLibraryItem(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="filter"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() =>
                          setDeleteTarget({
                            id: item.id,
                            name: item.name,
                            type: "library",
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Library item dialog ───────────────────────────────────────────────── */}
        <Dialog open={libraryItemDialog} onOpenChange={setLibraryItemDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingLibraryItem ? "Edit Library Item" : "New Library Item"}
              </DialogTitle>
            </DialogHeader>
            <ItemFormFields
              form={libraryItemForm}
              onChange={setLibraryItemForm}
              taxProfiles={taxProfiles}
              canManageTax={canManageTax}
              currencyCode={currencyCode}
              taxLabel={taxLabel}
              stations={stations}
            />
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setLibraryItemDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={saveLibraryItem}
                disabled={!libraryItemForm.name.trim() || !libraryItemForm.price || (!editingLibraryItem && !libraryItemForm.taxProfileId)}
              >
                {editingLibraryItem ? "Save" : "Add to Library"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RecipeEditorDialog
          businessId={businessId}
          item={recipeItem}
          onClose={() => setRecipeItem(null)}
          onSaved={() => {
            void loadStockFlags();
          }}
        />

        <ConfirmationDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={
            deleteTarget?.type === "library"
              ? "Remove library item"
              : `Delete ${deleteTarget?.type ?? "item"}`
          }
          description={
            deleteTarget?.type === "menu" || deleteTarget?.type === "category"
              ? `"${deleteTarget?.name}" and all its items will be permanently deleted.`
              : `"${deleteTarget?.name}" will be permanently removed.`
          }
          confirmLabel={deleteTarget?.type === "library" ? "Remove" : "Delete"}
          variant="destructive"
          onConfirm={() => {
            if (!deleteTarget) return;
            if (deleteTarget.type === "menu") {
              void confirmDeleteMenu(deleteTarget.id);
            } else if (deleteTarget.type === "category") {
              void confirmDeleteCategory(deleteTarget.menuId!, deleteTarget.id);
            } else if (deleteTarget.type === "item") {
              const menu = menus.find((candidate) => candidate.id === deleteTarget.menuId);
              const item = menu?.categories
                .flatMap((category) => category.items)
                .find((candidate) => candidate.id === deleteTarget.id);
              if (item) {
                void deleteItem(
                  item,
                  deleteTarget.menuId!,
                  deleteTarget.categoryId!,
                );
              }
            } else {
              const item = library.find((candidate) => candidate.id === deleteTarget.id);
              if (item) void deleteLibraryItem(item);
            }
            setDeleteTarget(null);
          }}
        />
      </PageBody>
    </>
  );
}

// ─── Shared item form fields ──────────────────────────────────────────────────

type ItemFormState = {
  name: string;
  description: string;
  price: string;
  isAlcoholic: boolean;
  routingDestination: string;
  prepTime: string;
  taxProfileId: string;
};

function ItemFormFields({
  form,
  onChange,
  showAlcohol = false,
  taxProfiles,
  canManageTax,
  currencyCode,
  taxLabel,
  stations,
}: {
  form: ItemFormState;
  onChange: React.Dispatch<React.SetStateAction<ItemFormState>>;
  // Alcohol flag only applies to live menu items, not library templates.
  showAlcohol?: boolean;
  taxProfiles: TaxProfile[];
  canManageTax: boolean;
  currencyCode: string;
  taxLabel: string;
  stations: PreparationStation[];
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={form.name}
          onChange={(e) => onChange((f) => ({ ...f, name: e.target.value }))}
          placeholder="Margherita Pizza"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description (optional)</Label>
        <Textarea
          value={form.description}
          onChange={(e) =>
            onChange((f) => ({ ...f, description: e.target.value }))
          }
          rows={2}
          placeholder="Tomato, mozzarella, basil"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Price ({currencyCode})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => onChange((f) => ({ ...f, price: e.target.value }))}
            placeholder="12.50"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prep time (min)</Label>
          <Input
            type="number"
            min="1"
            value={form.prepTime}
            onChange={(e) =>
              onChange((f) => ({ ...f, prepTime: e.target.value }))
            }
            placeholder="15"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Preparation station</Label>
        <Select
          value={form.routingDestination}
          onValueChange={(v) => onChange((f) => ({ ...f, routingDestination: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">Shared — visible at every station</SelectItem>
            {stations.filter((station) => station.isActive).map((station) => (
              <SelectItem key={station.id} value={station.id}>{station.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Operational tax profile</Label>
        <Select value={form.taxProfileId} onValueChange={(value) => onChange((current) => ({ ...current, taxProfileId: value }))} disabled={!canManageTax}>
          <SelectTrigger><SelectValue placeholder="Choose a tax profile" /></SelectTrigger>
          <SelectContent>{taxProfiles.filter((profile) => profile.isActive).map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.currentVersion?.name ?? profile.code} · {profile.currentVersion?.rate ?? 0}%</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{canManageTax ? `Modifiers inherit this profile. Estimates are non-fiscal ${taxLabel} data.` : "Only owners and managers can change tax assignments."}</p>
      </div>
      {showAlcohol && (
        <div className="flex items-start gap-2 rounded-md border p-3">
          <Checkbox
            id="isAlcoholic"
            checked={form.isAlcoholic}
            onCheckedChange={(v) =>
              onChange((f) => ({ ...f, isAlcoholic: v === true }))
            }
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="isAlcoholic" className="text-sm cursor-pointer">
              Contains alcohol
            </Label>
            <p className="text-xs text-muted-foreground">
              Prompts guests to confirm their age at checkout and shows an
              alcohol badge on staff order tickets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  menu,
  category,
  stockInfo,
  stations,
  onAddItem,
  onAddFromLibrary,
  onEditItem,
  onToggleAvail,
  onDeleteItem,
  onDeleteCategory,
  onRenameCategory,
  onSaveToLibrary,
  onEditRecipe,
  canCreateItems,
}: {
  menu: Menu;
  category: MenuCategory;
  stockInfo: Map<string, MenuItemStockInfo>;
  stations: PreparationStation[];
  onAddItem: (categoryId: string) => void;
  onAddFromLibrary: (categoryId: string) => void;
  onEditItem: (item: MenuItem, categoryId: string) => void;
  onToggleAvail: (item: MenuItem, categoryId: string) => void;
  onDeleteItem: (item: MenuItem, menuId: string, categoryId: string) => void;
  onDeleteCategory: (menuId: string, categoryId: string) => void;
  onRenameCategory: (menuId: string, categoryId: string, name: string) => void;
  onSaveToLibrary: (item: MenuItem) => void;
  onEditRecipe: (item: MenuItem) => void;
  canCreateItems: boolean;
}) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category.name);
  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        {renaming ? (
          <div className="flex items-center gap-[var(--space-8)]">
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onRenameCategory(menu.id, category.id, draft);
                  setRenaming(false);
                }
                if (event.key === "Escape") setRenaming(false);
              }}
              className="h-[var(--control-desktop)] w-48"
              aria-label={`Rename ${category.name}`}
            />
            <Button
              size="filter"
              variant="secondary"
              onClick={() => {
                onRenameCategory(menu.id, category.id, draft);
                setRenaming(false);
              }}
            >
              Save
            </Button>
            <Button size="filter" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <h3 className="type-t2">{category.name}</h3>
        )}
        <div className="flex flex-wrap gap-1.5">
          {!renaming && (
            <Button
              size="filter"
              variant="ghost"
              onClick={() => {
                setDraft(category.name);
                setRenaming(true);
              }}
            >
              Rename
            </Button>
          )}
          <Button
            size="filter"
            variant="ghost"
            onClick={() => onAddFromLibrary(category.id)}
          >
            <BookMarked className="h-3.5 w-3.5 mr-1" />
            Library
          </Button>
          {canCreateItems && <Button
            size="filter"
            variant="ghost"
            onClick={() => onAddItem(category.id)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Item
          </Button>}
          <Button
            size="filter"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDeleteCategory(menu.id, category.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {category.items.length === 0 ? (
        <p className="text-sm text-muted-foreground px-4 py-3">
          {canCreateItems ? <>No items. <button className="underline" onClick={() => onAddItem(category.id)}>Add one</button></> : "No items yet."}
        </p>
      ) : (
        <div className="divide-y">
          {category.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              {/* Wrap, not scroll: an item row's columns carry no cross-row
                  alignment, so below --bp-phone the price and the action
                  cluster drop under the name rather than running off the edge.
                  Inert wherever the line has room, so the tablet is unmoved. */}
              <div className="flex-1 min-w-[var(--row-content-min)]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`text-sm font-medium ${!item.isAvailable ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.name}
                  </span>
                  <Badge
                    tone="neutral"
                    className="text-xs flex items-center gap-1 h-4"
                  >
                    {item.routesToAllStations ? "Shared" : (stations.find((station) => station.id === item.preparationStationId)?.name ?? "Archived station")}
                  </Badge>
                  {!item.isAvailable && (
                    <Badge tone="neutral" className="text-xs h-4">
                      unavailable
                    </Badge>
                  )}
                  {stockInfo.get(item.id)?.hasLowStockIngredient && (
                    <Badge
                      tone="neutral"
                      className="flex items-center gap-1"
                      title="A recipe ingredient is below par level"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      low stock
                    </Badge>
                  )}
                  {stockInfo.get(item.id)?.servingsRemaining != null && (
                    <Badge
                      tone="neutral"
                      className="text-xs h-4 flex items-center gap-1 tabular-nums"
                      title="Servings you can still make from current stock (recipe-exact). Shared ingredients mean this drops when a related item sells too."
                    >
                      <Utensils className="h-3 w-3" />
                      ~{stockInfo.get(item.id)!.servingsRemaining} servings left
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              <span className="text-sm font-medium tabular-nums shrink-0">
                {money(item.price)}
              </span>
              <div className="flex gap-1">
                <Button
                  size="filter"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={() => onToggleAvail(item, category.id)}
                >
                  {item.isAvailable ? "86" : "Restore"}
                </Button>
                <Button
                  size="filter"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Edit recipe"
                  onClick={() => onEditRecipe(item)}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="filter"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Save to library"
                  onClick={() => onSaveToLibrary(item)}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="filter"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onEditItem(item, category.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="filter"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => onDeleteItem(item, menu.id, category.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recipe Editor ────────────────────────────────────────────────────────────

type RecipeRow = {
  inventoryItemId: string;
  quantity: string; // in the row's displayed unit (ml/oz for liquids, count otherwise)
  unit: "ml" | "oz"; // only meaningful for liquid ingredients
};

function RecipeEditorDialog({
  businessId,
  item,
  onClose,
  onSaved,
}: {
  businessId: string;
  item: MenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setLoading(true);
    setRows([]);
    void (async () => {
      try {
        const [inv, recipe] = await Promise.all([
          clientGetInventoryItems(businessId),
          clientGetRecipe(businessId, item.id),
        ]);
        if (cancelled) return;
        setInventory(inv);
        setRows(
          recipe.map((r: RecipeIngredient) => ({
            inventoryItemId: r.inventoryItemId,
            quantity: String(r.quantity),
            unit: "ml" as const,
          })),
        );
      } catch {
        if (!cancelled) toast.error("Failed to load recipe");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, businessId]);

  function invItem(id: string): InventoryItem | undefined {
    return inventory.find((i) => i.id === id);
  }

  function addRow() {
    const firstUnused = inventory.find(
      (i) => !rows.some((r) => r.inventoryItemId === i.id),
    );
    setRows((prev) => [
      ...prev,
      { inventoryItemId: firstUnused?.id ?? "", quantity: "", unit: "ml" },
    ]);
  }

  function updateRow(idx: number, patch: Partial<RecipeRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function toggleRowUnit(idx: number, nextUnit: "ml" | "oz") {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx || r.unit === nextUnit) return r;
        // Convert the entered value so the physical amount is unchanged.
        const val = Number(r.quantity);
        let converted = r.quantity;
        if (r.quantity !== "" && !isNaN(val)) {
          converted =
            nextUnit === "oz"
              ? mlToOz(val).toFixed(2)
              : ozToMl(val).toFixed(1);
        }
        return { ...r, unit: nextUnit, quantity: converted };
      }),
    );
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!item) return;
    const ingredients: { inventoryItemId: string; quantity: number }[] = [];
    for (const r of rows) {
      if (!r.inventoryItemId) continue;
      const val = Number(r.quantity);
      if (r.quantity === "" || isNaN(val) || val <= 0) {
        toast.error("Every ingredient needs a quantity greater than 0");
        return;
      }
      const inv = invItem(r.inventoryItemId);
      // Convert oz → ml for liquid ingredients; everything is stored in the
      // inventory item's native unit (ml for bottle/keg, count for 'each').
      const quantity =
        inv && isLiquidUnitType(inv.unitType) && r.unit === "oz"
          ? ozToMl(val)
          : val;
      ingredients.push({ inventoryItemId: r.inventoryItemId, quantity });
    }
    setSaving(true);
    try {
      await clientSetRecipe(businessId, item.id, ingredients);
      toast.success("Recipe saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Recipe — {item?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            Ingredients are deducted from inventory automatically when an order
            for this item is served. Liquid amounts are stored in ml; use the
            ml/oz toggle to enter pours in ounces.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Loading…
            </p>
          ) : inventory.length === 0 ? (
            <div className="border border-dashed p-6 text-center">
              <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No inventory items yet. Add stock items on the Inventory page
                first, then build the recipe here.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No ingredients yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const inv = invItem(row.inventoryItemId);
                const liquid = inv ? isLiquidUnitType(inv.unitType) : false;
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={row.inventoryItemId}
                      onValueChange={(v) =>
                        updateRow(idx, { inventoryItemId: v })
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select ingredient" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(idx, { quantity: e.target.value })
                      }
                      placeholder="Qty"
                      className="w-24 shrink-0"
                    />
                    {liquid ? (
                      <Select
                        value={row.unit}
                        onValueChange={(v) =>
                          toggleRowUnit(idx, v as "ml" | "oz")
                        }
                      >
                        <SelectTrigger className="w-20 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ml">ml</SelectItem>
                          <SelectItem value="oz">oz</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="w-20 shrink-0 text-xs text-muted-foreground truncate">
                        {inv?.unit ?? "each"}
                      </span>
                    )}
                    <Button
                      size="filter"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeRow(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {inventory.length > 0 && (
            <Button size="filter" variant="secondary" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add ingredient
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save Recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
