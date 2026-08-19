"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo, useState } from "react";
import { MapPin, Bed, Car, Refrigerator } from "lucide-react";
import { PropertySaveButton } from "@/components/properties/property-save-button";
import { PropertyListingImage } from "@/components/properties/property-listing-image";
import {
  PROPERTY_CATEGORIES,
  PROPERTY_TYPE_LABELS,
  RESIDENTIAL_TYPES,
  isSaleListing,
  type PropertyCategory,
} from "@/lib/subscription-limits";
import type { PropertyType } from "@prisma/client";

function listingIcon(type: string) {
  if (type === "CAR") return Car;
  if (type === "APPLIANCE") return Refrigerator;
  return Bed;
}

export default function PropertiesPage() {
  const { data: session } = useSession();
  const isBuyer = session?.user?.role === "BUYER";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"ALL" | PropertyCategory>("ALL");
  const [propertyType, setPropertyType] = useState("ALL");

  const typeOptions = useMemo(() => {
    if (category === "ALL") {
      return [
        ...RESIDENTIAL_TYPES.map((type) => ({ value: type, label: PROPERTY_TYPE_LABELS[type] })),
        { value: "CAR" as PropertyType, label: PROPERTY_TYPE_LABELS.CAR },
        { value: "APPLIANCE" as PropertyType, label: PROPERTY_TYPE_LABELS.APPLIANCE },
      ];
    }
    return PROPERTY_CATEGORIES[category].types.map((type) => ({
      value: type,
      label: PROPERTY_TYPE_LABELS[type],
    }));
  }, [category]);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", search, category, propertyType],
    queryFn: async () => {
      const params = new URLSearchParams({
        search,
        page: "1",
        limit: "12",
      });
      if (category !== "ALL") params.set("category", category);
      if (propertyType !== "ALL") params.set("propertyType", propertyType);

      const res = await fetch(`/api/properties?${params}`);
      const json = await res.json();
      return json.data;
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Browse listings</h1>
            <p className="mt-2 text-muted-foreground">
              Find houses, rooms, cars, and home appliances — apply for rental financing
            </p>
          </div>
          {isBuyer ? (
            <Button asChild className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/dashboard/buyer/applications">View request statuses</Link>
            </Button>
          ) : null}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px_220px]">
          <Input
            placeholder="Search by location, name, or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-full"
          />
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory((value ?? "ALL") as "ALL" | PropertyCategory);
              setPropertyType("ALL");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {(Object.keys(PROPERTY_CATEGORIES) as PropertyCategory[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PROPERTY_CATEGORIES[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={propertyType} onValueChange={(value) => setPropertyType(value ?? "ALL")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {typeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(PROPERTY_CATEGORIES) as PropertyCategory[]).map((key) => (
            <Badge
              key={key}
              variant={category === key ? "default" : "secondary"}
              className={category === key ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {PROPERTY_CATEGORIES[key].label}
            </Badge>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading listings...</p>
      ) : !data?.items?.length ? (
        <p className="text-muted-foreground">No listings found. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
          {data.items.map((property: {
            id: string;
            name: string;
            location: string;
            monthlyRent: number;
            discountedPrice?: number | null;
            propertyType: string;
            isPremium: boolean;
            images?: { id?: string; url: string; displayUrl?: string | null; src?: string | null }[];
          }) => {
            const Icon = listingIcon(property.propertyType);
            const isSale = isSaleListing(property.propertyType as PropertyType);
            const price = Number(property.monthlyRent);
            const discounted = property.discountedPrice
              ? Number(property.discountedPrice)
              : null;
            return (
              <Card key={property.id} className="gap-1 overflow-hidden py-0 [&_img]:rounded-none">
                <div className="relative aspect-[4/3] bg-muted sm:aspect-video">
                  <PropertySaveButton propertyId={property.id} />
                  {property.images?.[0] ? (
                    <PropertyListingImage
                      image={property.images[0]}
                      alt={property.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Icon className="h-12 w-12" />
                    </div>
                  )}
                </div>
                <CardHeader className="gap-0.5 p-3 pb-0 sm:p-4 sm:pb-0">
                  <div className="flex items-start justify-between gap-1">
                    <CardTitle className="line-clamp-2 text-sm font-semibold leading-tight sm:text-lg">
                      {property.name}
                    </CardTitle>
                    {property.isPremium && (
                      <Badge className="shrink-0 bg-amber-500 px-1.5 text-[10px] sm:text-xs">
                        Premium
                      </Badge>
                    )}
                  </div>
                  {!isSale && (
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground sm:text-sm">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {property.location}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-3 pt-1 sm:p-4 sm:pt-1">
                  {isSale ? (
                    <div className="space-y-1">
                      {discounted ? (
                        <>
                          <p className="text-sm text-muted-foreground line-through">
                            GHS {price.toLocaleString()}
                          </p>
                          <p className="text-base font-bold text-emerald-600 sm:text-xl">
                            GHS {discounted.toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p className="text-base font-bold text-emerald-600 sm:text-xl">
                          GHS {price.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-base font-bold text-emerald-600 sm:text-xl">
                      GHS {price.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground sm:text-sm">
                        /mo
                      </span>
                    </p>
                  )}
                  <Badge variant="secondary" className="mt-1 text-[10px] sm:text-xs">
                    {PROPERTY_TYPE_LABELS[property.propertyType as PropertyType] ??
                      property.propertyType}
                  </Badge>
                </CardContent>
                <CardFooter className="p-3 pt-0 sm:p-4 sm:pt-0">
                  <Button
                    asChild
                    size="sm"
                    className="h-8 w-full bg-emerald-600 text-xs hover:bg-emerald-700 sm:h-9 sm:text-sm"
                  >
                    <Link href={`/properties/${property.id}`}>View details</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
