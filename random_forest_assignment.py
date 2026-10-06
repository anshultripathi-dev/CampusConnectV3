"""Random Forest for a classification dataset and a regression dataset."""
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer, load_diabetes
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (ConfusionMatrixDisplay, accuracy_score,
                             confusion_matrix, mean_squared_error, r2_score)
from sklearn.model_selection import train_test_split

# ---------------- Classification: Breast Cancer dataset ----------------
data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42, stratify=data.target)

clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)
y_pred = clf.predict(X_test)

print("=== Classification (Breast Cancer) ===")
print("Accuracy score:", accuracy_score(y_test, y_pred))
print("Confusion matrix:\n", confusion_matrix(y_test, y_pred))

ConfusionMatrixDisplay.from_predictions(
    y_test, y_pred, display_labels=data.target_names, cmap="Blues")
plt.title("Random Forest - Confusion Matrix")
plt.savefig("confusion_matrix.png", dpi=150, bbox_inches="tight")

# ---------------- Regression: Diabetes dataset ----------------
data = load_diabetes()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42)

reg = RandomForestRegressor(n_estimators=100, random_state=42)
reg.fit(X_train, y_train)
y_pred = reg.predict(X_test)

print("\n=== Regression (Diabetes) ===")
print("R2 score:", r2_score(y_test, y_pred))
print("Mean squared error:", mean_squared_error(y_test, y_pred))
