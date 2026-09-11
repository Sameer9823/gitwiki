"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("page-header", className)} {...props}>{children}</div>;
}
export function PageHeaderContext({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("page-header-context", className)} {...props}>{children}</p>;
}
export function PageHeaderTitle({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("page-header-title", className)} {...props}>{children}</h1>;
}
export function PageHeaderSubtitle({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("page-header-subtitle", className)} {...props}>{children}</p>;
}
export function PageHeaderActions({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("page-header-actions", className)} {...props}>{children}</div>;
}
