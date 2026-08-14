"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clientGetMenus,
  clientCreateMenu,
  clientUpdateMenu,
  clientDeleteMenu,
  clientCreateCategory,
  clientDeleteCategory,
  clientCreateMenuItem,
  clientUpdateMenuItem,
  clientToggleItemAvailability,
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
} from "@/lib/client-api";
import type {
  InventoryItem,
  LibraryItem,
  Menu,
  MenuCategory,
  MenuItem,
  MenuItemStockInfo,
  RecipeIngredient,
  TaxProfile,
} from "@/types";
import Link from "next/link";
import { isLiquidUnitType, mlToOz, ozToMl } from "@/lib/units";
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
  Wine,
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
} from "lucide-react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";

const ROUTING_ICONS: Record<string, React.ReactNode> = {
  kitchen: <ChefHat className="h-3 w-3" />,
  bar: <Wine className="h-3 w-3" />,
  any: <Package className="h-3 w-3" />,
};

interface Props {
  businessId: string;
  businessSlug: string;
  canManageTax: boolean;
}

export function MenuManagementClient({ businessId, businessSlug, canManageTax }: Props) {
  const { currencyCode, locale, taxLabel } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);

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
    happyHourPrice: "",
    isAlcoholic: false,
    routingTag: "kitchen",
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
    happyHourPrice: "",
    isAlcoholic: false,
    routingTag: "kitchen",
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
      happyHourPrice: "",
      isAlcoholic: false,
      routingTag: "kitchen",
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
      happyHourPrice:
        item.happyHourPrice !== undefined && item.happyHourPrice !== null
          ? String(item.happyHourPrice)
          : "",
      isAlcoholic: item.isAlcoholic ?? false,
      routingTag: item.routingTag,
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
    // Blank happy-hour price = no discount (null clears it on update).
    let happyHourPrice: number | null = null;
    if (itemForm.happyHourPrice.trim()) {
      const parsed = parseFloat(itemForm.happyHourPrice);
      if (isNaN(parsed) || parsed < 0) {
        toast.error("Enter a valid happy hour price");
        return;
      }
      happyHourPrice = parsed;
    }
    try {
      if (editingItem) {
        const updated = await clientUpdateMenuItem(businessId, editingItem.id, {
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || undefined,
          price,
          happyHourPrice,
          isAlcoholic: itemForm.isAlcoholic,
          routingTag: itemForm.routingTag,
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
            happyHourPrice,
            isAlcoholic: itemForm.isAlcoholic,
            routingTag: itemForm.routingTag,
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
      const updated = await clientToggleItemAvailability(businessId, item.id);
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
      happyHourPrice: "",
      isAlcoholic: false,
      routingTag: "kitchen",
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
      happyHourPrice: "",
      isAlcoholic: false,
      routingTag: item.routingTag,
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
            routingTag: libraryItemForm.routingTag,
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
          routingTag: libraryItemForm.routingTag,
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
        <p className="text-muted-foreground">Loading menus…</p>
      </div>
    );
  }

  return (
    <div className="page-pad max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Menu Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create menus, categories, and items for your ordering board.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
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
        </div>
      </div>

      {/* Public QR-menu link — the URL customers scan/open to order */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Public menu link</p>
          <p className="text-xs text-muted-foreground truncate">
            {publicMenuUrl}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleCopyMenuLink}>
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
            <Button size="sm" variant="outline">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
            </Button>
          </Link>
        </div>
      </div>

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
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">{selectedMenu.name}</p>
                  {selectedMenu.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedMenu.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMenuActive(selectedMenu)}
                  >
                    {selectedMenu.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditMenu(selectedMenu)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMenu(selectedMenu.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openCreateCategory(selectedMenu.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Category
                  </Button>
                </div>
              </div>

              {/* Categories and items */}
              {selectedMenu.categories.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
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
            <Button variant="outline" onClick={() => setMenuDialog(false)}>
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
            <Button variant="outline" onClick={() => setCategoryDialog(false)}>
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
          <ItemFormFields form={itemForm} onChange={setItemForm} showHappyHour showAlcohol taxProfiles={taxProfiles} canManageTax={canManageTax} currencyCode={currencyCode} taxLabel={taxLabel} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>
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
            {canManageTax && <Button size="sm" variant="outline" onClick={openCreateLibraryItem}>
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
              <div className="rounded-lg border border-dashed p-8 text-center mt-2">
                <BookMarked className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No library items yet.
                </p>
                {canManageTax && <Button
                  size="sm"
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
                  className="flex items-center gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {item.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs flex items-center gap-1 h-4 shrink-0"
                      >
                        {ROUTING_ICONS[item.routingTag]}
                        {item.routingTag}
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
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-primary hover:text-primary"
                        title="Add to category"
                        onClick={() => addFromLibrary(item)}
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => openEditLibraryItem(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
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
          />
          <DialogFooter>
            <Button
              variant="outline"
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
    </div>
  );
}

// ─── Shared item form fields ──────────────────────────────────────────────────

type ItemFormState = {
  name: string;
  description: string;
  price: string;
  happyHourPrice: string;
  isAlcoholic: boolean;
  routingTag: string;
  prepTime: string;
  taxProfileId: string;
};

function ItemFormFields({
  form,
  onChange,
  showHappyHour = false,
  showAlcohol = false,
  taxProfiles,
  canManageTax,
  currencyCode,
  taxLabel,
}: {
  form: ItemFormState;
  onChange: React.Dispatch<React.SetStateAction<ItemFormState>>;
  // Happy-hour price only applies to live menu items, not library templates.
  showHappyHour?: boolean;
  // Alcohol flag only applies to live menu items, not library templates.
  showAlcohol?: boolean;
  taxProfiles: TaxProfile[];
  canManageTax: boolean;
  currencyCode: string;
  taxLabel: string;
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
      {showHappyHour && (
        <div className="space-y-1.5">
          <Label>Happy hour price ({currencyCode})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.happyHourPrice}
            onChange={(e) =>
              onChange((f) => ({ ...f, happyHourPrice: e.target.value }))
            }
            placeholder="Leave blank for no discount"
          />
          <p className="text-xs text-muted-foreground">
            This is the discounted price (how much). It only applies during the
            active windows (when) you define in{" "}
            <Link
              href="/business/happy-hour"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Happy Hour settings →
            </Link>
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Routing</Label>
        <Select
          value={form.routingTag}
          onValueChange={(v) => onChange((f) => ({ ...f, routingTag: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kitchen">Kitchen</SelectItem>
            <SelectItem value="bar">Bar</SelectItem>
            <SelectItem value="any">Any</SelectItem>
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
  onAddItem,
  onAddFromLibrary,
  onEditItem,
  onToggleAvail,
  onDeleteItem,
  onDeleteCategory,
  onSaveToLibrary,
  onEditRecipe,
  canCreateItems,
}: {
  menu: Menu;
  category: MenuCategory;
  stockInfo: Map<string, MenuItemStockInfo>;
  onAddItem: (categoryId: string) => void;
  onAddFromLibrary: (categoryId: string) => void;
  onEditItem: (item: MenuItem, categoryId: string) => void;
  onToggleAvail: (item: MenuItem, categoryId: string) => void;
  onDeleteItem: (item: MenuItem, menuId: string, categoryId: string) => void;
  onDeleteCategory: (menuId: string, categoryId: string) => void;
  onSaveToLibrary: (item: MenuItem) => void;
  onEditRecipe: (item: MenuItem) => void;
  canCreateItems: boolean;
}) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
        <h3 className="font-medium text-sm">{category.name}</h3>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddFromLibrary(category.id)}
          >
            <BookMarked className="h-3.5 w-3.5 mr-1" />
            Library
          </Button>
          {canCreateItems && <Button
            size="sm"
            variant="ghost"
            onClick={() => onAddItem(category.id)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Item
          </Button>}
          <Button
            size="sm"
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
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${!item.isAvailable ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs flex items-center gap-1 h-4"
                  >
                    {ROUTING_ICONS[item.routingTag]}
                    {item.routingTag}
                  </Badge>
                  {!item.isAvailable && (
                    <Badge variant="secondary" className="text-xs h-4">
                      unavailable
                    </Badge>
                  )}
                  {stockInfo.get(item.id)?.hasLowStockIngredient && (
                    <Badge
                      variant="outline"
                      className="text-xs h-4 flex items-center gap-1 border-amber-300 bg-amber-50 text-amber-700"
                      title="A recipe ingredient is below par level"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      low stock
                    </Badge>
                  )}
                  {stockInfo.get(item.id)?.servingsRemaining != null && (
                    <Badge
                      variant="outline"
                      className="text-xs h-4 flex items-center gap-1 border-slate-200 bg-slate-50 text-slate-600 tabular-nums"
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
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={() => onToggleAvail(item, category.id)}
                >
                  {item.isAvailable ? "86" : "Restore"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Edit recipe"
                  onClick={() => onEditRecipe(item)}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Save to library"
                  onClick={() => onSaveToLibrary(item)}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onEditItem(item, category.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
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
            <div className="rounded-lg border border-dashed p-6 text-center">
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
                      size="sm"
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
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add ingredient
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
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
