// src/components/admin/notifications/notification-table.tsx

"use client";

import { Bell, Mail } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { AdminNotificationItem } from "@/types/notification";
import { EmailStatusBadge } from "./email-status-badge";

/**
 * The notification list.
 *
 * A row is a link-shaped button, not a link: opening a notification shows the stored
 * email on the same page (operators compare the in-app text with what was sent), and
 * the "open in console" action lives inside the detail panel.
 */
export function NotificationTable({
  items,
  onOpen,
}: {
  items: AdminNotificationItem[];
  onOpen: (item: AdminNotificationItem) => void;
}) {
  return (
    <Table>
      <TableHead>
        <TableHeaderCell>Notification</TableHeaderCell>
        <TableHeaderCell>Recipient</TableHeaderCell>
        <TableHeaderCell>Audience</TableHeaderCell>
        <TableHeaderCell>Email</TableHeaderCell>
        <TableHeaderCell>Created</TableHeaderCell>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="cursor-pointer">
            <TableCell className="max-w-[22rem]">
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex w-full items-start gap-2 text-left"
              >
                <Bell
                  className={
                    item.read
                      ? "mt-0.5 h-4 w-4 shrink-0 text-slate-300"
                      : "mt-0.5 h-4 w-4 shrink-0 text-sky-600"
                  }
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {item.title}
                    </span>
                    {!item.read ? (
                      <span
                        aria-label="Unread"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600"
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-slate-500">
                    {item.body}
                  </span>
                </span>
              </button>
            </TableCell>
            <TableCell>
              <span className="block text-sm text-slate-800">
                {item.recipientName ?? "—"}
              </span>
              <span className="block text-xs text-slate-500">{item.recipientEmail}</span>
            </TableCell>
            <TableCell>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {item.audience === "admin" ? "Shop" : "Customer"}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <EmailStatusBadge status={item.emailStatus} />
              </div>
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap text-slate-500">
              {formatDateTime(item.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
