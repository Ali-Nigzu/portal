import { useCallback, useEffect, useRef, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import { searchEvents } from "../transport/searchEvents";
import type { EventData } from "../utils/eventTypes";

type EventLogsQueryOverrides = {
  searchEventsFn?: typeof searchEvents;
  viewToken?: string | null;
  clientId?: string | null;
};

export const useEventLogsQuery = (
  credentials: Credentials,
  overrides: EventLogsQueryOverrides = {},
) => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState({
    event: "",
    sex: "",
    age: "",
    trackId: "",
    race: "",
    cameraId: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    event: "",
    sex: "",
    age: "",
    trackId: "",
    race: "",
    cameraId: "",
  });
  const [draftStartDate, setDraftStartDate] = useState<Date | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<Date | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | null>(null);
  const [searchToken, setSearchToken] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const skipNextFetch = useRef(false);
  const eventsPerPage = 20;
  const storageKey = "camOS.eventLogsState";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        events?: EventData[];
        totalPages?: number;
        totalEvents?: number;
        currentPage?: number;
        draftFilters?: typeof draftFilters;
        appliedFilters?: typeof appliedFilters;
        draftStartDate?: string | null;
        draftEndDate?: string | null;
        appliedStartDate?: string | null;
        appliedEndDate?: string | null;
        searchToken?: number;
      };
      if (Array.isArray(parsed.events)) {
        setEvents(parsed.events);
      }
      if (typeof parsed.totalPages === "number") {
        setTotalPages(parsed.totalPages);
      }
      if (typeof parsed.totalEvents === "number") {
        setTotalEvents(parsed.totalEvents);
      }
      if (typeof parsed.currentPage === "number") {
        setCurrentPage(parsed.currentPage);
      }
      if (parsed.draftFilters) {
        setDraftFilters(parsed.draftFilters);
      }
      if (parsed.appliedFilters) {
        setAppliedFilters(parsed.appliedFilters);
      }
      if (parsed.draftStartDate) {
        setDraftStartDate(new Date(parsed.draftStartDate));
      }
      if (parsed.draftEndDate) {
        setDraftEndDate(new Date(parsed.draftEndDate));
      }
      if (parsed.appliedStartDate) {
        setAppliedStartDate(new Date(parsed.appliedStartDate));
      }
      if (parsed.appliedEndDate) {
        setAppliedEndDate(new Date(parsed.appliedEndDate));
      }
      if (typeof parsed.searchToken === "number") {
        setSearchToken(parsed.searchToken);
        if (parsed.searchToken > 0) {
          skipNextFetch.current = true;
        }
      }
    } catch {
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const payload = {
      events,
      totalPages,
      totalEvents,
      currentPage,
      draftFilters,
      appliedFilters,
      draftStartDate: draftStartDate ? draftStartDate.toISOString() : null,
      draftEndDate: draftEndDate ? draftEndDate.toISOString() : null,
      appliedStartDate: appliedStartDate
        ? appliedStartDate.toISOString()
        : null,
      appliedEndDate: appliedEndDate ? appliedEndDate.toISOString() : null,
      searchToken,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    appliedEndDate,
    appliedFilters,
    appliedStartDate,
    currentPage,
    draftEndDate,
    draftFilters,
    draftStartDate,
    events,
    searchToken,
    storageKey,
    totalEvents,
    totalPages,
  ]);

  const clampToToday = (date: Date | null): Date | null => {
    if (!date) {
      return null;
    }
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next.getTime() > today.getTime() ? new Date(today) : next;
  };

  const sanitizeTrackId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    return trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  };

  const buildSearchParams = useCallback(
    (includePagination: boolean): URLSearchParams => {
      const searchParams = new URLSearchParams();
      if (includePagination) {
        searchParams.append("page", currentPage.toString());
        searchParams.append("per_page", eventsPerPage.toString());
      }
      if (appliedStartDate) {
        searchParams.append(
          "start_date",
          appliedStartDate.toISOString().split("T")[0],
        );
      }
      if (appliedEndDate) {
        searchParams.append(
          "end_date",
          appliedEndDate.toISOString().split("T")[0],
        );
      }
      if (appliedFilters.event) {
        searchParams.append("event", appliedFilters.event);
      }
      if (appliedFilters.sex) {
        searchParams.append("sex", appliedFilters.sex);
      }
      if (appliedFilters.age) {
        searchParams.append("age", appliedFilters.age);
      }
      const sanitizedTrackId = sanitizeTrackId(appliedFilters.trackId);
      if (sanitizedTrackId) {
        searchParams.append("track_id", sanitizedTrackId);
      }
      if (appliedFilters.race) {
        searchParams.append("race", appliedFilters.race);
      }
      if (appliedFilters.cameraId) {
        searchParams.append("camera_id", appliedFilters.cameraId);
      }
      return searchParams;
    },
    [
      appliedEndDate,
      appliedFilters,
      appliedStartDate,
      currentPage,
      eventsPerPage,
    ],
  );

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const viewToken =
        overrides.viewToken !== undefined
          ? overrides.viewToken
          : getViewTokenFromLocation();
      const urlParams = new URLSearchParams(window.location.search);
      const clientId =
        overrides.clientId !== undefined
          ? overrides.clientId
          : urlParams.get("client_id");
      const searchParams = buildSearchParams(true);
      const searchEventsFn = overrides.searchEventsFn ?? searchEvents;
      const result = await searchEventsFn({
        searchParams,
        viewToken,
        credentials,
        clientId,
      });
      setEvents((result.events as EventData[]) || []);
      setTotalPages(result.total_pages || 1);
      setTotalEvents(result.total || 0);
      setError(null);
    } catch (err) {
      setError(
        `Failed to fetch events: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  }, [buildSearchParams, credentials, overrides.clientId, overrides.searchEventsFn, overrides.viewToken]);

  useEffect(() => {
    if (searchToken === 0) {
      return;
    }
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    fetchEvents();
  }, [fetchEvents, searchToken]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setAppliedStartDate(clampToToday(draftStartDate));
    setAppliedEndDate(clampToToday(draftEndDate));
    setCurrentPage(1);
    setSearchToken((prev) => prev + 1);
  };

  const fetchExportEvents = useCallback(async () => {
    const viewToken =
      overrides.viewToken !== undefined
        ? overrides.viewToken
        : getViewTokenFromLocation();
    const urlParams = new URLSearchParams(window.location.search);
    const clientId =
      overrides.clientId !== undefined
        ? overrides.clientId
        : urlParams.get("client_id");
    const searchParams = buildSearchParams(false);
    const searchEventsFn = overrides.searchEventsFn ?? searchEvents;
    const result = await searchEventsFn({
      searchParams,
      viewToken,
      credentials,
      clientId,
    });
    return (result.events as EventData[]) || [];
  }, [buildSearchParams, credentials, overrides.clientId, overrides.searchEventsFn, overrides.viewToken]);

  return {
    events,
    loading,
    error,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    draftStartDate,
    setDraftStartDate,
    draftEndDate,
    setDraftEndDate,
    appliedStartDate,
    appliedEndDate,
    currentPage,
    setCurrentPage,
    totalPages,
    totalEvents,
    eventsPerPage,
    searchToken,
    handleSearch,
    fetchEvents,
    fetchExportEvents,
  };
};
