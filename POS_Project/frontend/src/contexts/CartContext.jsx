import { createContext, useContext, useReducer } from 'react';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const initialState = {
  items: [],
  discount: 0,
  customerId: null,
};

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.product_id === action.payload.product_id);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.product_id === action.payload.product_id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.payload, quantity: 1 }] };
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.product_id !== action.payload) };

    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items
          .map((i) =>
            i.product_id === action.payload.product_id
              ? { ...i, quantity: action.payload.quantity }
              : i
          )
          .filter((i) => i.quantity > 0),
      };

    case 'SET_ITEM_DISCOUNT':
      return {
        ...state,
        items: state.items.map((i) =>
          i.product_id === action.payload.product_id
            ? { ...i, discount: action.payload.discount }
            : i
        ),
      };

    case 'SET_BILL_DISCOUNT':
      return { ...state, discount: action.payload };

    case 'SET_CUSTOMER':
      return { ...state, customerId: action.payload };

    case 'CLEAR_CART':
      return initialState;

    case 'RESTORE_CART':
      return action.payload;

    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, initialState);
  const { activeStore } = useAuth();

  const subTotal = cart.items.reduce(
    (sum, item) => sum + item.selling_price * item.quantity - (item.discount || 0),
    0
  );

  const vatRate = (activeStore?.vat_rate ?? 7) / 100;
  const taxableAmount = subTotal - cart.discount;
  const tax = Math.round(taxableAmount * vatRate * 100) / 100;
  const total = taxableAmount + tax;

  const addItem = (product) =>
    dispatch({ type: 'ADD_ITEM', payload: { product_id: product.id, ...product } });

  const removeItem = (productId) =>
    dispatch({ type: 'REMOVE_ITEM', payload: productId });

  const updateQuantity = (productId, quantity) =>
    dispatch({ type: 'UPDATE_QUANTITY', payload: { product_id: productId, quantity } });

  const setItemDiscount = (productId, discount) =>
    dispatch({ type: 'SET_ITEM_DISCOUNT', payload: { product_id: productId, discount } });

  const setBillDiscount = (discount) =>
    dispatch({ type: 'SET_BILL_DISCOUNT', payload: discount });

  const setCustomer = (customerId) =>
    dispatch({ type: 'SET_CUSTOMER', payload: customerId });

  const clearCart = () => dispatch({ type: 'CLEAR_CART' });

  const restoreCart = (cartData) =>
    dispatch({ type: 'RESTORE_CART', payload: cartData });

  return (
    <CartContext.Provider
      value={{
        cart,
        subTotal,
        tax,
        total,
        addItem,
        removeItem,
        updateQuantity,
        setItemDiscount,
        setBillDiscount,
        setCustomer,
        clearCart,
        restoreCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
