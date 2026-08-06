import React from "react";

export type LayoutProps<T extends string = string> = {
  children: React.ReactNode;
};

export type RouteContext<T extends string = string> = {
  params: Promise<Record<string, string>>;
};
