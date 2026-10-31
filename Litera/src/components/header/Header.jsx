import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import {
  formatRoleName,
} from "../../../utils/auth";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import { fetchUserInquiry, fetchAdminUnreadCount } from "../../../utils/inquiries";
import "./Header.css";

const MessengerModal = lazy(() => import("../messenger/MessengerModal"));

const navClass = ({ isActive }) =>
  isActive ? "nav__link active-link" : "nav__link";

export default function Header({ theme, isLight, onSearch }) {
  const navigate = useNavigate();
  const { language, toggleLanguage, t } = useLanguage();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const {
    user,
    isLoggedIn: loggedIn,
    isPrivileged: isPrivilegedUser,
    roles: userRoles,
    logout: authLogout,
  } = useAuth();
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [adminAttention, setAdminAttention] = useState(false);

  useEffect(() => {
    const onRefer = () => setAdminAttention(true);
    const onOpen = () => {
      setIsMessengerOpen(true);
      setAdminAttention(false);
    };

    window.addEventListener("litera-refer-to-admin", onRefer);
    window.addEventListener("litera-open-messenger", onOpen);

    return () => {
      window.removeEventListener("litera-refer-to-admin", onRefer);
      window.removeEventListener("litera-open-messenger", onOpen);
    };
  }, []);

  useEffect(() => {
    if (isMessengerOpen) {
      setAdminAttention(false);
    }
  }, [isMessengerOpen]);

  const isAdminOrDev =
    userRoles.includes("admin") || userRoles.includes("developer");

  // Check unread messages for regular user
  useEffect(() => {
    if (isAdminOrDev) return;
    const checkUnread = async () => {
      try {
        const guestEmail = localStorage.getItem("litera_guest_inquiry_email");
        const activeUserId = loggedIn ? (user?.id || getCookieUser()?.id) : null;
        if (!activeUserId && !guestEmail) return;
        const inq = await fetchUserInquiry({
          userId: activeUserId,
          userEmail: loggedIn ? null : guestEmail,
        });
        if (inq?.notifications_user) {
          setUnreadCount(Number(inq.notifications_user));
        } else {
          setUnreadCount(0);
        }
      } catch {
        // ignore
      }
    };
    const initTimer = setTimeout(checkUnread, 2000);
    const interval = setInterval(checkUnread, 15000);
    const onUpdated = () => checkUnread();
    window.addEventListener("litera-inquiries-updated", onUpdated);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener("litera-inquiries-updated", onUpdated);
    };
  }, [loggedIn, user?.id, isAdminOrDev]);

  // Check unread messages for admin / privileged user
  useEffect(() => {
    if (!isPrivilegedUser && !isAdminOrDev) return;
    const checkAdminUnread = async () => {
      try {
        const currentUserId = user?.id || getCookieUser()?.id;
        const cnt = await fetchAdminUnreadCount(currentUserId);
        setAdminUnreadCount(cnt);
      } catch {
        // ignore
      }
    };
    const initTimer = setTimeout(checkAdminUnread, 2000);
    const interval = setInterval(checkAdminUnread, 15000);
    const onUpdated = () => checkAdminUnread();
    window.addEventListener("litera-inquiries-updated", onUpdated);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener("litera-inquiries-updated", onUpdated);
    };
  }, [isPrivilegedUser, isAdminOrDev, user?.id]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    authLogout();
    navigate("/");
  };

  return (
    <header className="header" id="header">
      <nav className="nav container">
        <Link to="/" className="nav__logo">
          <img
            src="/assets/img/logo-dark.png"
            alt=""
            className={`nav__logo-image ${isLight ? "fade-out" : "fade-in"}`}
          />
          <img
            src="/assets/img/logo-light.png"
            alt=""
            className={`nav__logo-image ${isLight ? "fade-in" : "fade-out"}`}
          />
        </Link>
        <div className="nav__menu">
          <ul className="nav__list">
            <li className="nav__item">
              <NavLink to="/" end className={navClass}>
                <i className="ri-home-line" />
                <span>{t("nav.home")}</span>
              </NavLink>
            </li>
            <li className="nav__item">
              <NavLink to="/featured" className={navClass}>
                <i className="ri-book-3-line" />
                <span>{t("nav.bookPicks")}</span>
              </NavLink>
            </li>
            <li className="nav__item">
              <NavLink to="/discount" className={navClass}>
                <i className="ri-price-tag-3-line" />
                <span>{t("nav.discount")}</span>
              </NavLink>
            </li>
            <li className="nav__item">
              <NavLink to="/new" className={navClass}>
                <i className="ri-bookmark-line" />
                <span>{t("nav.newBooks")}</span>
              </NavLink>
            </li>
            <li className="nav__item">
              <NavLink to="/testimonial" className={navClass}>
                <i className="ri-message-3-line" />
                <span>{t("nav.testimonial")}</span>
              </NavLink>
            </li>
            <li className="nav__item">
              <NavLink to="/contacts" className={navClass}>
                <i className="ri-contacts-book-2-line" />
                <span>{t("nav.contacts")}</span>
              </NavLink>
            </li>
          </ul>
        </div>
        <div className="nav__actions">
          <button
            type="button"
            className="nav__lang-toggle"
            onClick={toggleLanguage}
            title={language === "ru" ? "Switch to English" : "Переключить на русский"}
            aria-label={t("nav.language")}
          >
            <span className={language === "ru" ? "nav__lang-item--active" : "nav__lang-item"}>
              RU
            </span>
            <span className="nav__lang-divider">/</span>
            <span className={language === "en" ? "nav__lang-item--active" : "nav__lang-item"}>
              EN
            </span>
          </button>
          <i
            className="ri-search-line search-button"
            id="search-button"
            onClick={onSearch}
            title={t("nav.search")}
          />
          <Link to="/cart" aria-label={t("nav.cart")} title={t("nav.cart")}>
            <i className="ri-shopping-basket-2-line" />
          </Link>

          {!isAdminOrDev && (
            <button
              type="button"
              className={`nav__messenger-btn ${adminAttention ? "nav__messenger-btn--attention" : ""}`}
              onClick={() => {
                setIsMessengerOpen((prev) => !prev);
                setAdminAttention(false);
              }}
              title={t("nav.messenger")}
              aria-label={t("nav.messenger")}
            >
              <i className="ri-customer-service-2-line" />
              {unreadCount > 0 && (
                <span className="nav__badge-count">{unreadCount}</span>
              )}
            </button>
          )}

          {loggedIn ? (
            <div className="nav__profile-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className={`nav__profile-btn ${isDropdownOpen ? "nav__profile-btn--open" : ""}`}
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                aria-expanded={isDropdownOpen}
                aria-haspopup="menu"
                aria-label={t("nav.profile")}
                title={t("nav.profile")}
              >
                <i className="ri-user-line login-button" id="login-button" />
              </button>

              {isDropdownOpen && (
                <div className="nav__profile-dropdown" role="menu">
                  {user?.firstName && (
                    <div className="nav__profile-header">
                      <span className="nav__profile-welcome">
                        {language === "ru" ? "Здравствуйте," : "Hello,"}
                      </span>
                      <div className="nav__profile-name-row">
                        <span
                          className={`nav__profile-name ${isPrivilegedUser ? "nav__profile-name--gold" : ""}`}
                        >
                          {user.firstName}
                        </span>
                        {isPrivilegedUser && (
                          <span
                            className="nav__profile-crown-badge"
                            title={
                              language === "ru"
                                ? "Привилегированный пользователь"
                                : "Privileged user"
                            }
                            aria-label={
                              language === "ru"
                                ? "Привилегированный пользователь"
                                : "Privileged user"
                            }
                          >
                            <svg
                              className="nav__crown-svg"
                              viewBox="0 0 24 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <defs>
                                <linearGradient
                                  id="navCrownGold"
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="100%"
                                >
                                  <stop offset="0%" stopColor="#FFF7CC" />
                                  <stop offset="25%" stopColor="#FFD700" />
                                  <stop offset="60%" stopColor="#F59E0B" />
                                  <stop offset="100%" stopColor="#B45309" />
                                </linearGradient>
                                <linearGradient
                                  id="navCrownShine"
                                  x1="0%"
                                  y1="0%"
                                  x2="0%"
                                  y2="100%"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#FFFFFF"
                                    stopOpacity="0.85"
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#FFFFFF"
                                    stopOpacity="0.05"
                                  />
                                </linearGradient>
                                <filter
                                  id="navCrownGlow"
                                  x="-30%"
                                  y="-30%"
                                  width="160%"
                                  height="160%"
                                >
                                  <feDropShadow
                                    dx="0"
                                    dy="1.2"
                                    stdDeviation="1.5"
                                    floodColor="#F59E0B"
                                    floodOpacity="0.6"
                                  />
                                </filter>
                              </defs>
                              <rect
                                x="2"
                                y="15"
                                width="20"
                                height="3.5"
                                rx="1.75"
                                fill="url(#navCrownGold)"
                              />
                              <circle
                                cx="6"
                                cy="16.75"
                                r="1.1"
                                fill="#3B82F6"
                                stroke="#1E40AF"
                                strokeWidth="0.3"
                              />
                              <circle
                                cx="12"
                                cy="16.75"
                                r="1.3"
                                fill="#EF4444"
                                stroke="#991B1B"
                                strokeWidth="0.3"
                              />
                              <circle
                                cx="18"
                                cy="16.75"
                                r="1.1"
                                fill="#10B981"
                                stroke="#065F46"
                                strokeWidth="0.3"
                              />
                              <path
                                d="M2.5 14L4 5.2L8.5 10.2L12 2.8L15.5 10.2L20 5.2L21.5 14H2.5Z"
                                fill="url(#navCrownGold)"
                                filter="url(#navCrownGlow)"
                              />
                              <path
                                d="M12 2.8L13.8 9.5L12 8.2L10.2 9.5L12 2.8Z"
                                fill="url(#navCrownShine)"
                              />
                              <circle
                                cx="4"
                                cy="5.2"
                                r="1.6"
                                fill="#FFFBEB"
                                stroke="#B45309"
                                strokeWidth="0.5"
                              />
                              <circle
                                cx="12"
                                cy="2.8"
                                r="2"
                                fill="#FFFFFF"
                                stroke="#D97706"
                                strokeWidth="0.6"
                              />
                              <circle
                                cx="20"
                                cy="5.2"
                                r="1.6"
                                fill="#FFFBEB"
                                stroke="#B45309"
                                strokeWidth="0.5"
                              />
                              <polygon
                                points="12,10 13.3,12 12,13.5 10.7,12"
                                fill="#DC2626"
                              />
                            </svg>
                          </span>
                        )}
                      </div>
                      {userRoles && userRoles.length > 0 && (
                        <div className="nav__profile-roles-row">
                          {userRoles.map((role) => (
                            <span
                              key={role}
                              className={`nav__profile-role-pill nav__profile-role-pill--${role}`}
                            >
                              {formatRoleName(role, language)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <ul className="nav__profile-menu">
                    <li className="nav__profile-item" role="none">
                      <Link
                        to="/profile"
                        role="menuitem"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <i className="ri-user-3-line" />
                        <span>{t("nav.profile")}</span>
                      </Link>
                    </li>
                    {isPrivilegedUser && (
                      <li className="nav__profile-item" role="none">
                        <Link
                          to="/privileged"
                          role="menuitem"
                          onClick={() => setIsDropdownOpen(false)}
                          className="nav__profile-privileged-link"
                        >
                          <span className="nav__profile-link-content">
                            <i className="ri-shield-check-line" />
                            <span>{t("privileged.title")}</span>
                          </span>
                          {adminUnreadCount > 0 && (
                            <span className="nav__dropdown-badge">{adminUnreadCount}</span>
                          )}
                        </Link>
                      </li>
                    )}
                    <li className="nav__profile-item" role="none">
                      <Link
                        to="/orders/current"
                        role="menuitem"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <i className="ri-time-line" />
                        <span>{t("nav.currentOrders")}</span>
                      </Link>
                    </li>
                    <li className="nav__profile-item" role="none">
                      <Link
                        to="/orders/completed"
                        role="menuitem"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <i className="ri-checkbox-circle-line" />
                        <span>{t("nav.completedOrders")}</span>
                      </Link>
                    </li>
                    <li className="nav__profile-divider" role="separator" />
                    <li className="nav__profile-item" role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="nav__profile-logout-btn"
                        onClick={handleLogout}
                      >
                        <i className="ri-logout-box-r-line" />
                        <span>{t("nav.logout")}</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              aria-label={t("nav.login")}
              title={t("nav.login")}
            >
              <i className="ri-user-line login-button" id="login-button" />
            </Link>
          )}

          {isPrivilegedUser && (
            <Link
              to="/privileged"
              className="nav__settings-btn"
              title={t("privileged.title")}
              aria-label={t("privileged.title")}
            >
              <i className="ri-settings-3-line settings-button" id="settings-button" />
              {adminUnreadCount > 0 && (
                <span className="nav__badge-count">{adminUnreadCount}</span>
              )}
            </Link>
          )}

          <i
            className={`${isLight ? "ri-moon-line" : "ri-sun-line"} change-theme`}
            id="theme-button"
            onClick={theme}
            title={t("nav.theme")}
          />
        </div>
      </nav>

      {isMessengerOpen && (
        <Suspense fallback={null}>
          <MessengerModal
            isOpen={isMessengerOpen}
            onClose={() => setIsMessengerOpen(false)}
            onUnreadChange={(cnt) => setUnreadCount(cnt)}
          />
        </Suspense>
      )}
    </header>
  );
}
